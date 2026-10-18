import type { Session } from "next-auth";

function splitList(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdmin(session: Session | null): boolean {
  if (!session?.user) return false;

  if (session.user.role === "admin") return true;

  const usernames = splitList(process.env.ADMIN_USERNAMES);
  const emails = splitList(process.env.ADMIN_EMAILS);

  const name = session.user.name?.trim().toLowerCase();
  const email = session.user.email?.trim().toLowerCase();

  if (name && usernames.includes(name)) return true;
  if (email && emails.includes(email)) return true;

  return false;
}
