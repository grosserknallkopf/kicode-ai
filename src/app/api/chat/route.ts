import { streamText, convertToCoreMessages } from "ai";
import { auth } from "@/lib/auth";
import { gateway, PRIMARY_MODEL, getGatewayOptions } from "@/lib/gateway";
import { agentTools } from "@/lib/tools";

export const maxDuration = 120;

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { messages } = await req.json();

  const result = streamText({
    model: gateway(PRIMARY_MODEL),
    messages: convertToCoreMessages(messages),
    system: `Du bist KiCode AI – ein agentischer KI-Programmierassistent für eine Schul-Programmier-AG.
Deine Aufgabe ist es, Nutzern beim Programmieren zu helfen.

WICHTIGE REGELN:
1. Wenn du Code schreibst, nutze IMMER das 'executeCode'-Tool, damit das Ergebnis direkt im Preview-Panel angezeigt wird.
2. Wenn du nicht weiterweißt oder aktuelle Infos brauchst, nutze das 'searchWeb'-Tool.
3. Für Multi-File-Projekte nutze das 'createFile'-Tool.
4. Erkläre deinen Code klar und verständlich – deine Nutzer sind Schüler:innen.
5. Markiere Code immer mit \`\`\`sprache ... \`\`\` Blöcken.
6. Gib bei HTML/CSS/JS-Projekten immer den vollständigen Code aus, der direkt ausgeführt werden kann.

Dein Motto: "Code → Ausführen → Ergebnis sehen!"`,
    tools: agentTools,
    providerOptions: getGatewayOptions(session.user.id, ["chat"]) as any,
    onFinish({ text, usage }) {
      console.log(
        `[KiCode] User ${session.user.id}: ${usage.totalTokens} tokens`
      );
    },
  });

  return result.toDataStreamResponse();
}
