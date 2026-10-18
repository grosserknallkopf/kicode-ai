import {
  streamText,
  convertToModelMessages,
  stepCountIs,
  type UIMessage,
} from "ai";
import { auth } from "@/lib/auth";
import { gateway, PRIMARY_MODEL, getGatewayOptions } from "@/lib/gateway";
import { agentTools } from "@/lib/tools";
import {
  addConversationTokens,
  autoTitleConversation,
  createConversation,
  getConversation,
  messageText,
  replaceConversationMessages,
  saveAssistantPartial,
  setConversationStatus,
  upsertUser,
} from "@/lib/db";

export const maxDuration = 60;

async function scheduleBackground(task: Promise<unknown>): Promise<void> {
  try {
    const { waitUntil } = await import("@vercel/functions");
    waitUntil(task);
    return;
  } catch {
    // Not running on Vercel – try Cloudflare next.
  }

  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const { ctx } = await getCloudflareContext({ async: true });
    ctx.waitUntil(task);
    return;
  } catch {
    void task;
  }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  if (!process.env.AI_GATEWAY_API_KEY) {
    return new Response(
      "AI_GATEWAY_API_KEY ist nicht konfiguriert. Bitte als Umgebungsvariable setzen.",
      { status: 500 }
    );
  }

  const body = (await req.json()) as {
    messages?: UIMessage[];
    conversationId?: string;
  };
  const messages = body.messages ?? [];

  const lastUserMessage = [...messages]
    .reverse()
    .find((message) => message.role === "user");
  const userText = lastUserMessage ? messageText(lastUserMessage) : "";

  const conversationId = body.conversationId || crypto.randomUUID();

  const existing = await getConversation(conversationId);
  if (existing && existing.user_id !== session.user.id) {
    return new Response("Forbidden", { status: 403 });
  }

  await upsertUser({
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    image: session.user.image,
  });
  await createConversation(conversationId, session.user.id);
  await autoTitleConversation(conversationId, userText);

  // Persist the user's turn immediately so it survives a failed generation.
  if (messages.length > 0) {
    await replaceConversationMessages(conversationId, messages);
  }

  await setConversationStatus(conversationId, "streaming");

  const assistantId = crypto.randomUUID();
  let streamedText = "";
  let lastSavedAt = 0;

  const result = streamText({
    model: gateway(PRIMARY_MODEL),
    messages: await convertToModelMessages(messages),
    system: `Du bist KiCode AI – ein agentischer KI-Programmierassistent für eine Schul-Programmier-AG.
Deine Aufgabe ist es, Nutzern beim Programmieren zu helfen.

WICHTIGE REGELN:
1. Wenn du Code schreibst, nutze IMMER das 'executeCode'-Tool, damit das Ergebnis direkt in der Vorschau erscheint.
2. Wenn du nicht weiterweißt oder aktuelle Infos brauchst, nutze das 'searchWeb'-Tool.
3. Für größere Projekte lege mit dem 'createFile'-Tool mehrere Dateien an (z. B. index.html, style.css, script.js) und verweise im HTML auf style.css und script.js.
4. Antworte immer auf Deutsch und erkläre deinen Code klar und verständlich – deine Nutzer sind Schüler:innen.
5. Markiere Code immer mit \`\`\`sprache ... \`\`\` Blöcken.
6. Gib bei HTML/CSS/JS-Projekten immer den vollständigen Code aus, der direkt ausgeführt werden kann.

Dein Motto: "Code → Ausführen → Ergebnis sehen!"`,
    tools: agentTools,
    stopWhen: stepCountIs(5),
    maxOutputTokens: 4096,
    providerOptions: getGatewayOptions(session.user.id, ["chat"]) as any,
    onChunk({ chunk }) {
      if (chunk.type !== "text-delta") return;
      streamedText += chunk.text;
      const now = Date.now();
      if (now - lastSavedAt < 1200) return;
      lastSavedAt = now;
      void saveAssistantPartial(
        conversationId,
        assistantId,
        streamedText
      ).catch((error) => {
        console.error("[KiCode] Zwischenspeichern fehlgeschlagen", error);
      });
    },
    onError({ error }) {
      console.error("[KiCode] Stream-Fehler", error);
      void setConversationStatus(conversationId, "idle");
    },
    onAbort() {
      void setConversationStatus(conversationId, "idle");
    },
    onFinish({ usage }) {
      console.log(
        `[KiCode] User ${session.user?.id}: ${usage.totalTokens} tokens`
      );
      void addConversationTokens(conversationId, usage.totalTokens ?? 0);
    },
  });

  const streamResponse = result.toUIMessageStreamResponse({
    originalMessages: messages,
    generateMessageId: () => assistantId,
    sendReasoning: false,
    onError(error) {
      console.error("[KiCode] UI-Stream-Fehler", error);
      void setConversationStatus(conversationId, "idle");
      return "Es gab ein Problem beim Schreiben der Antwort. Bitte versuche es erneut.";
    },
    onEnd: async ({ messages: finalMessages, isAborted }) => {
      try {
        await replaceConversationMessages(conversationId, finalMessages);
        if (isAborted) {
          console.log(`[KiCode] Stream abgebrochen für ${conversationId}`);
        }
      } catch (error) {
        console.error("[KiCode] Speichern fehlgeschlagen", error);
      } finally {
        await setConversationStatus(conversationId, "idle");
      }
    },
  });

  const consume = (async () => {
    try {
      const reader = streamResponse.body?.getReader();
      if (!reader) return;
      while (true) {
        const { done } = await reader.read();
        if (done) break;
      }
    } catch (error) {
      console.error("[KiCode] Hintergrund-Stream fehlgeschlagen", error);
      await setConversationStatus(conversationId, "idle");
    }
  })();

  await scheduleBackground(consume);

  return Response.json(
    { conversationId, status: "streaming" },
    { status: 202 }
  );
}
