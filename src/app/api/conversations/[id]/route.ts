import { auth } from "@/lib/auth";
import {
  deleteConversation,
  getConversation,
  getConversationMessages,
  parseStoredMessages,
  renameConversation,
  setConversationStatus,
} from "@/lib/db";

type RouteContext = { params: Promise<{ id: string }> };

async function ownedConversation(id: string) {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: Response.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const conversation = await getConversation(id);
  if (!conversation || conversation.user_id !== session.user.id) {
    return { error: Response.json({ error: "Not found" }, { status: 404 }) };
  }

  return { conversation, session };
}

export async function GET(_req: Request, context: RouteContext) {
  const { id } = await context.params;
  const result = await ownedConversation(id);
  if ("error" in result) return result.error;

  if (result.conversation.status === "streaming") {
    const updated = new Date(
      result.conversation.updated_at.replace(" ", "T") + "Z"
    ).getTime();
    if (Number.isFinite(updated) && Date.now() - updated > 120_000) {
      await setConversationStatus(id, "idle");
      result.conversation.status = "idle";
    }
  }

  const messages = await getConversationMessages(id);
  return Response.json({
    conversation: result.conversation,
    messages: parseStoredMessages(messages),
  });
}

export async function PATCH(req: Request, context: RouteContext) {
  const { id } = await context.params;
  const result = await ownedConversation(id);
  if ("error" in result) return result.error;

  const body = (await req.json()) as { title?: string };
  const title = body.title?.trim();
  if (!title) {
    return Response.json({ error: "Titel fehlt" }, { status: 400 });
  }

  await renameConversation(id, title);
  return Response.json({ success: true });
}

export async function DELETE(_req: Request, context: RouteContext) {
  const { id } = await context.params;
  const result = await ownedConversation(id);
  if ("error" in result) return result.error;

  await deleteConversation(id);
  return Response.json({ success: true });
}
