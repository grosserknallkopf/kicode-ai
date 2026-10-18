import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ isAdmin: false }, { status: 401 });
  }
  return Response.json({ isAdmin: isAdmin(session) });
}
