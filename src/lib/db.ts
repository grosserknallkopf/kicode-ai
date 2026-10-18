import type { UIMessage } from "ai";

interface D1Result<T> {
  results?: T[];
  success: boolean;
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  run<T = unknown>(): Promise<D1Result<T>>;
  all<T = unknown>(): Promise<D1Result<T>>;
  first<T = unknown>(): Promise<T | null>;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
}

export interface ConversationRecord {
  id: string;
  user_id: string;
  title: string;
  total_tokens: number;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface ConversationSummary {
  id: string;
  title: string;
  total_tokens: number;
  created_at: string;
  updated_at: string;
  message_count: number;
}

export interface StoredMessage {
  id: string;
  conversation_id: string;
  role: string;
  parts: string;
  text: string;
  created_at: string;
}

export interface AdminConversationRow extends ConversationSummary {
  user_id: string;
  user_name: string | null;
  user_email: string | null;
}

export interface AdminStats {
  users: number;
  conversations: number;
  messages: number;
  tokens: number;
}

type D1RestQuery = { sql: string; params?: unknown[] };

class D1RestStatement implements D1PreparedStatement {
  constructor(
    private readonly db: D1RestDatabase,
    readonly sql: string,
    readonly params: unknown[] = []
  ) {}

  bind(...values: unknown[]): D1PreparedStatement {
    return new D1RestStatement(
      this.db,
      this.sql,
      values.map((value) => (value === undefined ? null : value))
    );
  }

  async run<T = unknown>(): Promise<D1Result<T>> {
    const results = await this.db.execute<T>([
      { sql: this.sql, params: this.params },
    ]);
    return results[0] ?? { success: true, results: [] };
  }

  async all<T = unknown>(): Promise<D1Result<T>> {
    return this.run<T>();
  }

  async first<T = unknown>(): Promise<T | null> {
    const result = await this.run<T>();
    return result.results?.[0] ?? null;
  }
}

class D1RestDatabase implements D1Database {
  constructor(
    private readonly accountId: string,
    private readonly databaseId: string,
    private readonly token: string
  ) {}

  prepare(query: string): D1PreparedStatement {
    return new D1RestStatement(this, query);
  }

  async execute<T = unknown>(
    queries: D1RestQuery[]
  ): Promise<D1Result<T>[]> {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/d1/database/${this.databaseId}/query`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ batch: queries }),
        cache: "no-store",
      }
    );

    const payload = (await response.json()) as {
      success: boolean;
      errors?: { message?: string }[];
      result?: D1Result<T>[];
    };

    if (!response.ok || !payload.success) {
      const detail =
        payload.errors?.map((error) => error.message).filter(Boolean).join("; ") ||
        `HTTP ${response.status}`;
      throw new Error(`D1-Fehler: ${detail}`);
    }

    return payload.result ?? [];
  }

  async batch<T = unknown>(
    statements: D1PreparedStatement[]
  ): Promise<D1Result<T>[]> {
    const queries = statements.map((statement) => {
      const rest = statement as D1RestStatement;
      return { sql: rest.sql, params: rest.params };
    });
    return this.execute<T>(queries);
  }
}

let cachedDb: D1Database | null = null;

export async function getDb(): Promise<D1Database> {
  if (cachedDb) return cachedDb;

  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const { env } = await getCloudflareContext({ async: true });
    const binding = (env as { DB?: D1Database }).DB;
    if (binding) {
      cachedDb = binding;
      return binding;
    }
  } catch {
    // Not running on Cloudflare – fall back to the D1 REST API.
  }

  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const databaseId = process.env.CLOUDFLARE_D1_DATABASE_ID;
  const token = process.env.CLOUDFLARE_D1_API_TOKEN;

  if (!accountId || !databaseId || !token) {
    throw new Error(
      "D1-Umgebungsvariablen fehlen: CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_D1_DATABASE_ID, CLOUDFLARE_D1_API_TOKEN."
    );
  }

  cachedDb = new D1RestDatabase(accountId, databaseId, token);
  return cachedDb;
}

export function messageText(message: UIMessage): string {
  return (message.parts ?? [])
    .filter((part) => part.type === "text")
    .map((part) => (part as { text: string }).text)
    .join("")
    .trim();
}

export async function upsertUser(user: {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
}): Promise<void> {
  const db = await getDb();
  await db
    .prepare(
      `INSERT INTO users (id, name, email, image)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         email = excluded.email,
         image = excluded.image,
         last_seen_at = datetime('now')`
    )
    .bind(user.id, user.name ?? null, user.email ?? null, user.image ?? null)
    .run();
}

export async function listConversations(
  userId: string
): Promise<ConversationSummary[]> {
  const db = await getDb();
  const { results } = await db
    .prepare(
      `SELECT c.id, c.title, c.total_tokens, c.created_at, c.updated_at,
              COUNT(m.id) AS message_count
       FROM conversations c
       LEFT JOIN messages m ON m.conversation_id = c.id
       WHERE c.user_id = ?
       GROUP BY c.id
       ORDER BY c.updated_at DESC
       LIMIT 100`
    )
    .bind(userId)
    .all<ConversationSummary>();
  return results ?? [];
}

export async function createConversation(
  id: string,
  userId: string,
  title = "Neuer Chat"
): Promise<void> {
  const db = await getDb();
  await db
    .prepare(
      `INSERT INTO conversations (id, user_id, title)
       VALUES (?, ?, ?)
       ON CONFLICT(id) DO NOTHING`
    )
    .bind(id, userId, title)
    .run();
}

export async function getConversation(
  id: string
): Promise<ConversationRecord | null> {
  const db = await getDb();
  return db
    .prepare(`SELECT * FROM conversations WHERE id = ?`)
    .bind(id)
    .first<ConversationRecord>();
}

export async function getConversationMessages(
  conversationId: string
): Promise<StoredMessage[]> {
  const db = await getDb();
  const { results } = await db
    .prepare(
      `SELECT * FROM messages WHERE conversation_id = ?
       ORDER BY created_at ASC, rowid ASC`
    )
    .bind(conversationId)
    .all<StoredMessage>();
  return results ?? [];
}

export async function replaceConversationMessages(
  conversationId: string,
  messages: UIMessage[]
): Promise<void> {
  const db = await getDb();
  const statements = [
    db
      .prepare(`DELETE FROM messages WHERE conversation_id = ?`)
      .bind(conversationId),
  ];

  messages.forEach((message, index) => {
    statements.push(
      db
        .prepare(
          `INSERT INTO messages (id, conversation_id, role, parts, text, created_at)
           VALUES (?, ?, ?, ?, ?, datetime('now', ?))`
        )
        .bind(
          message.id,
          conversationId,
          message.role,
          JSON.stringify(message.parts ?? []),
          messageText(message),
          `+${index} seconds`
        )
    );
  });

  statements.push(
    db
      .prepare(
        `UPDATE conversations SET updated_at = datetime('now') WHERE id = ?`
      )
      .bind(conversationId)
  );

  await db.batch(statements);
}

export async function renameConversation(
  id: string,
  title: string
): Promise<void> {
  const db = await getDb();
  await db
    .prepare(
      `UPDATE conversations SET title = ?, updated_at = datetime('now') WHERE id = ?`
    )
    .bind(title.slice(0, 120), id)
    .run();
}

export async function autoTitleConversation(
  id: string,
  text: string
): Promise<void> {
  const title = text.replace(/\s+/g, " ").trim().slice(0, 60);
  if (!title) return;
  const db = await getDb();
  await db
    .prepare(
      `UPDATE conversations SET title = ?
       WHERE id = ? AND (title = '' OR title = 'Neuer Chat')`
    )
    .bind(title, id)
    .run();
}

export async function addConversationTokens(
  id: string,
  tokens: number
): Promise<void> {
  if (!tokens || tokens <= 0) return;
  const db = await getDb();
  await db
    .prepare(
      `UPDATE conversations SET total_tokens = total_tokens + ? WHERE id = ?`
    )
    .bind(tokens, id)
    .run();
}

export async function deleteConversation(id: string): Promise<void> {
  const db = await getDb();
  await db.batch([
    db.prepare(`DELETE FROM messages WHERE conversation_id = ?`).bind(id),
    db.prepare(`DELETE FROM conversations WHERE id = ?`).bind(id),
  ]);
}

export async function getAdminStats(): Promise<AdminStats> {
  const db = await getDb();
  const row = await db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM users) AS users,
         (SELECT COUNT(*) FROM conversations) AS conversations,
         (SELECT COUNT(*) FROM messages) AS messages,
         (SELECT COALESCE(SUM(total_tokens), 0) FROM conversations) AS tokens`
    )
    .first<AdminStats>();
  return row ?? { users: 0, conversations: 0, messages: 0, tokens: 0 };
}

export async function listAllConversations(
  limit = 100
): Promise<AdminConversationRow[]> {
  const db = await getDb();
  const { results } = await db
    .prepare(
      `SELECT c.id, c.user_id, c.title, c.total_tokens, c.created_at,
              c.updated_at, COUNT(m.id) AS message_count,
              u.name AS user_name, u.email AS user_email
       FROM conversations c
       LEFT JOIN messages m ON m.conversation_id = c.id
       LEFT JOIN users u ON u.id = c.user_id
       GROUP BY c.id
       ORDER BY c.updated_at DESC
       LIMIT ?`
    )
    .bind(limit)
    .all<AdminConversationRow>();
  return results ?? [];
}

export function parseStoredMessages(
  messages: StoredMessage[]
): UIMessage[] {
  return messages.map((message) => {
    let parts: UIMessage["parts"] = [];
    try {
      parts = JSON.parse(message.parts) as UIMessage["parts"];
    } catch {
      parts = [{ type: "text", text: message.text }] as UIMessage["parts"];
    }
    return {
      id: message.id,
      role: message.role as UIMessage["role"],
      parts,
    } as UIMessage;
  });
}

export interface AdminUserRow {
  id: string;
  username: string | null;
  name: string | null;
  email: string | null;
  role: string;
  disabled: number;
  created_at: string;
  last_seen_at: string;
  conversation_count: number;
}

export interface DbUser {
  id: string;
  username: string | null;
  name: string | null;
  email: string | null;
  image: string | null;
  password_hash: string | null;
  role: string;
  disabled: number;
  created_at: string;
  last_seen_at: string;
}

export async function listUsers(limit = 100): Promise<AdminUserRow[]> {
  const db = await getDb();
  const { results } = await db
    .prepare(
      `SELECT u.id, u.username, u.name, u.email, u.role, u.disabled,
              u.created_at, u.last_seen_at,
              COUNT(c.id) AS conversation_count
       FROM users u
       LEFT JOIN conversations c ON c.user_id = u.id
       GROUP BY u.id
       ORDER BY u.last_seen_at DESC
       LIMIT ?`
    )
    .bind(limit)
    .all<AdminUserRow>();
  return results ?? [];
}

export async function getUserByUsername(
  username: string
): Promise<DbUser | null> {
  const db = await getDb();
  return db
    .prepare(`SELECT * FROM users WHERE username = ?`)
    .bind(username.toLowerCase())
    .first<DbUser>();
}

export async function createUser(input: {
  username: string;
  name: string;
  passwordHash: string;
  role?: string;
}): Promise<string> {
  const db = await getDb();
  const id = `user:${crypto.randomUUID()}`;
  await db
    .prepare(
      `INSERT INTO users (id, username, name, password_hash, role)
       VALUES (?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      input.username.toLowerCase(),
      input.name,
      input.passwordHash,
      input.role === "admin" ? "admin" : "user"
    )
    .run();
  return id;
}

export async function setUserPassword(
  id: string,
  passwordHash: string
): Promise<void> {
  const db = await getDb();
  await db
    .prepare(`UPDATE users SET password_hash = ? WHERE id = ?`)
    .bind(passwordHash, id)
    .run();
}

export async function setUserDisabled(
  id: string,
  disabled: boolean
): Promise<void> {
  const db = await getDb();
  await db
    .prepare(`UPDATE users SET disabled = ? WHERE id = ?`)
    .bind(disabled ? 1 : 0, id)
    .run();
}

export async function setUserRole(id: string, role: string): Promise<void> {
  const db = await getDb();
  await db
    .prepare(`UPDATE users SET role = ? WHERE id = ?`)
    .bind(role === "admin" ? "admin" : "user", id)
    .run();
}

export async function deleteUser(id: string): Promise<void> {
  const db = await getDb();
  await db.batch([
    db
      .prepare(
        `DELETE FROM messages WHERE conversation_id IN
           (SELECT id FROM conversations WHERE user_id = ?)`
      )
      .bind(id),
    db.prepare(`DELETE FROM conversations WHERE user_id = ?`).bind(id),
    db.prepare(`DELETE FROM users WHERE id = ?`).bind(id),
  ]);
}

export interface ConversationWithUser extends ConversationRecord {
  user_name: string | null;
  user_email: string | null;
}

export async function getConversationWithUser(
  id: string
): Promise<ConversationWithUser | null> {
  const db = await getDb();
  return db
    .prepare(
      `SELECT c.*, u.name AS user_name, u.email AS user_email
       FROM conversations c
       LEFT JOIN users u ON u.id = c.user_id
       WHERE c.id = ?`
    )
    .bind(id)
    .first<ConversationWithUser>();
}

export async function setConversationStatus(
  id: string,
  status: "idle" | "streaming"
): Promise<void> {
  const db = await getDb();
  await db
    .prepare(
      `UPDATE conversations SET status = ?, updated_at = datetime('now') WHERE id = ?`
    )
    .bind(status, id)
    .run();
}

export async function saveAssistantPartial(
  conversationId: string,
  messageId: string,
  text: string
): Promise<void> {
  const db = await getDb();
  const parts = JSON.stringify([{ type: "text", text }]);
  await db
    .prepare(
      `INSERT INTO messages (id, conversation_id, role, parts, text, created_at)
       VALUES (?, ?, 'assistant', ?, ?, datetime('now'))
       ON CONFLICT(conversation_id, id) DO UPDATE SET
         parts = excluded.parts,
         text = excluded.text,
         created_at = datetime('now')`
    )
    .bind(messageId, conversationId, parts, text)
    .run();
}
