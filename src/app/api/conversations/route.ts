import { auth } from "@/lib/auth";
import {
  createConversation,
  listConversations,
  upsertUser,
} from "@/lib/db";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  await upsertUser({
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    image: session.user.image,
  });

  const conversations = await listConversations(session.user.id);
  return Response.json({ conversations });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let title = "Neuer Chat";
  try {
    const body = (await req.json()) as { title?: string };
    if (typeof body.title === "string" && body.title.trim()) {
      title = body.title.trim().slice(0, 120);
    }
  } catch {
    // empty body is fine
  }

  const id = crypto.randomUUID();
  await createConversation(id, session.user.id, title);

  return Response.json({ conversation: { id, title } }, { status: 201 });
}
