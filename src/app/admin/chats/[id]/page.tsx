import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";
import {
  deleteConversation,
  getConversationMessages,
  getConversationWithUser,
  parseStoredMessages,
} from "@/lib/db";
import { ConfirmButton } from "@/components/ConfirmButton";

export const dynamic = "force-dynamic";

function formatDate(value: string): string {
  return new Date(value.replace(" ", "T") + "Z").toLocaleString("de-DE", {
    dateStyle: "short",
    timeStyle: "short",
  });
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
  redirect("/admin");
}

export default async function AdminChatPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!isAdmin(session)) redirect("/");

  const { id } = await params;
  const conversation = await getConversationWithUser(id);
  if (!conversation) notFound();

  const messages = parseStoredMessages(await getConversationMessages(id));

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <Link
              href="/admin"
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              ← Zurück zur Übersicht
            </Link>
            <h1 className="text-xl font-bold tracking-tight mt-2 truncate">
              {conversation.title || "Neuer Chat"}
            </h1>
            <p className="text-xs text-muted-foreground mt-1">
              {conversation.user_name || conversation.user_id}
              {conversation.user_email ? ` · ${conversation.user_email}` : ""}
              {" · "}
              {messages.length} Nachrichten ·{" "}
              {conversation.total_tokens.toLocaleString("de-DE")} Tokens ·{" "}
              {formatDate(conversation.updated_at)}
            </p>
          </div>
          <form action={deleteChatAction}>
            <input type="hidden" name="id" value={conversation.id} />
            <ConfirmButton
              message="Diesen Chat wirklich löschen?"
              className="text-xs rounded-lg border border-destructive/40 text-destructive px-3 py-2 hover:bg-destructive/10 transition-colors"
            >
              Chat löschen
            </ConfirmButton>
          </form>
        </div>

        <div className="space-y-3">
          {messages.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Dieser Chat enthält noch keine Nachrichten.
            </p>
          ) : (
            messages.map((message) => {
              const text = message.parts
                .filter((part) => part.type === "text")
                .map((part) => (part as { text: string }).text)
                .join("");
              const tools = message.parts.filter((part) =>
                part.type.startsWith("tool-")
              );
              return (
                <div
                  key={message.id}
                  className={`rounded-xl border px-4 py-3 ${
                    message.role === "user"
                      ? "border-primary/30 bg-primary/5"
                      : "border-border bg-card"
                  }`}
                >
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
                    {message.role === "user" ? "Nutzer" : "KiCode AI"}
                  </p>
                  {text ? (
                    <p className="text-sm whitespace-pre-wrap break-words">
                      {text}
                    </p>
                  ) : null}
                  {tools.map((part, index) => {
                    const tool = part as {
                      type: string;
                      state?: string;
                      input?: unknown;
                      output?: unknown;
                      errorText?: string;
                    };
                    return (
                      <details
                        key={`${message.id}-tool-${index}`}
                        className="mt-2 text-xs text-muted-foreground"
                      >
                        <summary className="cursor-pointer">
                          🛠️ {tool.type.replace(/^tool-/, "")} ·{" "}
                          {tool.state ?? "unbekannt"}
                        </summary>
                        <pre className="mt-1 overflow-x-auto rounded-lg bg-secondary/50 p-2 text-[11px]">
                          {JSON.stringify(
                            {
                              input: tool.input,
                              output: tool.output,
                              error: tool.errorText,
                            },
                            null,
                            2
                          )}
                        </pre>
                      </details>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
