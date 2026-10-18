import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";
import {
  createUser,
  deleteConversation,
  deleteUser,
  getAdminStats,
  getUserByUsername,
  listAllConversations,
  listUsers,
  setUserDisabled,
  setUserPassword,
  setUserRole,
} from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { ConfirmButton } from "@/components/ConfirmButton";

export const dynamic = "force-dynamic";

function formatDate(value: string): string {
  return new Date(value.replace(" ", "T") + "Z").toLocaleString("de-DE", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

const USERNAME_PATTERN = /^[a-z0-9._-]{3,32}$/;

async function createUserAction(formData: FormData) {
  "use server";
  const session = await auth();
  if (!session?.user || !isAdmin(session)) redirect("/");

  const username = String(formData.get("username") ?? "")
    .trim()
    .toLowerCase();
  const name = String(formData.get("name") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const role = formData.get("role") === "admin" ? "admin" : "user";

  if (!USERNAME_PATTERN.test(username)) {
    redirect("/admin?error=username");
  }
  if (password.length < 8) {
    redirect("/admin?error=password");
  }
  if (await getUserByUsername(username)) {
    redirect("/admin?error=exists");
  }

  await createUser({
    username,
    name: name || username,
    passwordHash: await hashPassword(password),
    role,
  });

  revalidatePath("/admin");
  redirect("/admin?created=1");
}

async function resetPasswordAction(formData: FormData) {
  "use server";
  const session = await auth();
  if (!session?.user || !isAdmin(session)) redirect("/");

  const id = String(formData.get("id") ?? "");
  const password = String(formData.get("password") ?? "");
  if (!id || password.length < 8) {
    redirect("/admin?error=password");
  }

  await setUserPassword(id, await hashPassword(password));
  revalidatePath("/admin");
  redirect("/admin?updated=1");
}

async function toggleDisabledAction(formData: FormData) {
  "use server";
  const session = await auth();
  if (!session?.user || !isAdmin(session)) redirect("/");

  const id = String(formData.get("id") ?? "");
  const disabled = formData.get("disabled") === "1";
  if (id) await setUserDisabled(id, disabled);
  revalidatePath("/admin");
  redirect("/admin?updated=1");
}

async function toggleRoleAction(formData: FormData) {
  "use server";
  const session = await auth();
  if (!session?.user || !isAdmin(session)) redirect("/");

  const id = String(formData.get("id") ?? "");
  const role = formData.get("role") === "admin" ? "admin" : "user";
  if (id) await setUserRole(id, role);
  revalidatePath("/admin");
  redirect("/admin?updated=1");
}

async function deleteUserAction(formData: FormData) {
  "use server";
  const session = await auth();
  if (!session?.user || !isAdmin(session)) redirect("/");

  const id = String(formData.get("id") ?? "");
  if (id) await deleteUser(id);
  revalidatePath("/admin");
  redirect("/admin?updated=1");
}

async function deleteChatAction(formData: FormData) {
  "use server";
  const session = await auth();
  if (!session?.user || !isAdmin(session)) {
    redirect("/");
  }
  const id = formData.get("id");
  if (typeof id === "string" && id) {
    await deleteConversation(id);
  }
  revalidatePath("/admin");
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string; created?: string; updated?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!isAdmin(session)) redirect("/");

  const [stats, conversations, users] = await Promise.all([
    getAdminStats(),
    listAllConversations(200),
    listUsers(200),
  ]);

  const params = searchParams ? await searchParams : undefined;

  const messages: Record<string, string> = {
    username:
      "Benutzername ungültig: 3–32 Zeichen, nur a–z, 0–9, Punkt, Unterstrich und Bindestrich.",
    password: "Das Passwort muss mindestens 8 Zeichen haben.",
    exists: "Dieser Benutzername ist bereits vergeben.",
  };

  const cards = [
    { label: "Nutzer", value: stats.users },
    { label: "Chats", value: stats.conversations },
    { label: "Nachrichten", value: stats.messages },
    { label: "Tokens", value: stats.tokens },
  ];

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Admin-Bereich</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Nutzung, gespeicherte Chats und Nutzer von KiCode AI.
            </p>
          </div>
          <Link
            href="/"
            className="text-xs rounded-lg border border-border px-3 py-2 hover:bg-secondary transition-colors"
          >
            Zurück zum Chat
          </Link>
        </div>

        {params?.error && messages[params.error] ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {messages[params.error]}
          </div>
        ) : null}
        {params?.created ? (
          <div className="rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-600 dark:text-green-400">
            Konto wurde angelegt.
          </div>
        ) : null}
        {params?.updated ? (
          <div className="rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-600 dark:text-green-400">
            Änderung gespeichert.
          </div>
        ) : null}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {cards.map((card) => (
            <div
              key={card.label}
              className="rounded-xl border border-border bg-card px-4 py-3"
            >
              <p className="text-xs text-muted-foreground">{card.label}</p>
              <p className="text-2xl font-semibold mt-1">
                {card.value.toLocaleString("de-DE")}
              </p>
            </div>
          ))}
        </div>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Chats
          </h2>
          <div className="rounded-xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-xs text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Titel</th>
                  <th className="text-left px-4 py-2 font-medium">Nutzer</th>
                  <th className="text-right px-4 py-2 font-medium">Nachr.</th>
                  <th className="text-right px-4 py-2 font-medium">Tokens</th>
                  <th className="text-left px-4 py-2 font-medium">Aktualisiert</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {conversations.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-6 text-center text-muted-foreground"
                    >
                      Noch keine Chats gespeichert.
                    </td>
                  </tr>
                ) : (
                  conversations.map((conversation) => (
                    <tr
                      key={conversation.id}
                      className="border-t border-border hover:bg-secondary/30"
                    >
                      <td className="px-4 py-2 max-w-[280px] truncate">
                        <Link
                          href={`/admin/chats/${conversation.id}`}
                          className="hover:text-primary underline-offset-2 hover:underline"
                        >
                          {conversation.title || "Neuer Chat"}
                        </Link>
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">
                        {conversation.user_name ||
                          conversation.user_email ||
                          conversation.user_id}
                      </td>
                      <td className="px-4 py-2 text-right">
                        {conversation.message_count}
                      </td>
                      <td className="px-4 py-2 text-right">
                        {conversation.total_tokens.toLocaleString("de-DE")}
                      </td>
                      <td className="px-4 py-2 text-muted-foreground whitespace-nowrap">
                        {formatDate(conversation.updated_at)}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <form action={deleteChatAction}>
                          <input
                            type="hidden"
                            name="id"
                            value={conversation.id}
                          />
                          <button
                            type="submit"
                            className="text-xs text-muted-foreground hover:text-destructive transition-colors"
                          >
                            Löschen
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Konto für AG-Mitglied anlegen
          </h2>
          <form
            action={createUserAction}
            className="rounded-xl border border-border bg-card p-4 grid gap-3 sm:grid-cols-5 sm:items-end"
          >
            <label className="space-y-1 text-xs text-muted-foreground">
              <span>Benutzername</span>
              <input
                name="username"
                required
                autoComplete="off"
                placeholder="z. B. lisa.m"
                className="w-full rounded-lg bg-secondary px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/50"
              />
            </label>
            <label className="space-y-1 text-xs text-muted-foreground">
              <span>Anzeigename</span>
              <input
                name="name"
                autoComplete="off"
                placeholder="Lisa M."
                className="w-full rounded-lg bg-secondary px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/50"
              />
            </label>
            <label className="space-y-1 text-xs text-muted-foreground">
              <span>Startpasswort</span>
              <input
                name="password"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                className="w-full rounded-lg bg-secondary px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/50"
              />
            </label>
            <label className="space-y-1 text-xs text-muted-foreground">
              <span>Rolle</span>
              <select
                name="role"
                className="w-full rounded-lg bg-secondary px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/50"
              >
                <option value="user">Mitglied</option>
                <option value="admin">Admin</option>
              </select>
            </label>
            <button
              type="submit"
              className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              Konto anlegen
            </button>
          </form>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Nutzer
          </h2>
          <div className="rounded-xl border border-border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-xs text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Benutzer</th>
                  <th className="text-left px-4 py-2 font-medium">Rolle</th>
                  <th className="text-left px-4 py-2 font-medium">Status</th>
                  <th className="text-right px-4 py-2 font-medium">Chats</th>
                  <th className="text-left px-4 py-2 font-medium">Zuletzt aktiv</th>
                  <th className="text-left px-4 py-2 font-medium">Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {users.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-6 text-center text-muted-foreground"
                    >
                      Noch keine Nutzer erfasst.
                    </td>
                  </tr>
                ) : (
                  users.map((user) => {
                    const isEnvAdmin = user.id.startsWith("local:");
                    return (
                      <tr key={user.id} className="border-t border-border align-top">
                        <td className="px-4 py-3">
                          <p className="font-medium">{user.name || user.id}</p>
                          <p className="text-xs text-muted-foreground">
                            {user.username ? `@${user.username}` : user.email || "–"}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-[11px] ${
                              user.role === "admin"
                                ? "bg-primary/15 text-primary"
                                : "bg-secondary text-muted-foreground"
                            }`}
                          >
                            {user.role === "admin" ? "Admin" : "Mitglied"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {user.disabled ? (
                            <span className="text-xs text-destructive">gesperrt</span>
                          ) : (
                            <span className="text-xs text-muted-foreground">aktiv</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {user.conversation_count}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                          {formatDate(user.last_seen_at)}
                        </td>
                        <td className="px-4 py-3">
                          {isEnvAdmin ? (
                            <span className="text-xs text-muted-foreground">
                              Umgebungs-Admin
                            </span>
                          ) : (
                            <div className="flex flex-wrap items-center gap-2 text-xs">
                              <details className="relative">
                                <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                                  Passwort
                                </summary>
                                <form
                                  action={resetPasswordAction}
                                  className="flex gap-1 mt-2"
                                >
                                  <input type="hidden" name="id" value={user.id} />
                                  <input
                                    name="password"
                                    type="password"
                                    required
                                    minLength={8}
                                    placeholder="Neu (min. 8)"
                                    className="w-32 rounded-lg bg-secondary px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-primary/50"
                                  />
                                  <button
                                    type="submit"
                                    className="rounded-lg border border-border px-2 py-1 hover:bg-secondary"
                                  >
                                    Setzen
                                  </button>
                                </form>
                              </details>

                              <form action={toggleRoleAction}>
                                <input type="hidden" name="id" value={user.id} />
                                <input
                                  type="hidden"
                                  name="role"
                                  value={user.role === "admin" ? "user" : "admin"}
                                />
                                <button
                                  type="submit"
                                  className="text-muted-foreground hover:text-foreground"
                                >
                                  {user.role === "admin" ? "Zu Mitglied" : "Zu Admin"}
                                </button>
                              </form>

                              <form action={toggleDisabledAction}>
                                <input type="hidden" name="id" value={user.id} />
                                <input
                                  type="hidden"
                                  name="disabled"
                                  value={user.disabled ? "0" : "1"}
                                />
                                <button
                                  type="submit"
                                  className="text-muted-foreground hover:text-foreground"
                                >
                                  {user.disabled ? "Entsperren" : "Sperren"}
                                </button>
                              </form>

                              <form action={deleteUserAction}>
                                <input type="hidden" name="id" value={user.id} />
                                <ConfirmButton
                                  message={`Konto ${user.username || user.name || user.id} und alle zugehörigen Chats löschen?`}
                                  className="text-muted-foreground hover:text-destructive"
                                >
                                  Löschen
                                </ConfirmButton>
                              </form>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
