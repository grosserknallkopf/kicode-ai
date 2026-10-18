import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";
import { deleteConversation } from "@/lib/db";

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(_req: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user || !isAdmin(session)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  await deleteConversation(id);
  return Response.json({ success: true });
}
