import { getDb } from "@/lib/db";

type ProxyQuery = { sql: string; params?: unknown[] };

function safeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return diff === 0;
}

export async function POST(req: Request) {
  const expected = process.env.DB_PROXY_SECRET;
  const provided = req.headers.get("x-db-secret");

  if (!expected || !provided || !safeEqual(provided, expected)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json()) as { batch?: ProxyQuery[] };
  if (!Array.isArray(body.batch)) {
    return Response.json({ error: "batch fehlt" }, { status: 400 });
  }

  const db = await getDb();
  const results = await db.batch(
    body.batch.map((query) =>
      db.prepare(query.sql).bind(...(query.params ?? []))
    )
  );

  return Response.json({ result: results });
}
