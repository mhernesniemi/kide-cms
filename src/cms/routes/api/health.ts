import type { APIRoute } from "astro";
import { sql } from "drizzle-orm";
// Narrow imports (not the core barrel): this route compiles in the Cloudflare profile too.
import { log } from "../../core/log";
import { getDb } from "../../core/runtime";

export const prerender = false;

// Liveness + readiness for deploy healthchecks and uptime monitors. Queries a CMS table, not
// `select 1`: SQLite silently creates an empty file at a wrong path, and that must fail too.
const handler: APIRoute = async () => {
  const headers = { "Cache-Control": "no-store" };
  try {
    const db = await getDb();
    await db.all(sql`select 1 from cms_users limit 1`);
    return Response.json({ ok: true }, { headers });
  } catch (error) {
    log.error("[kide] health check failed:", error);
    return Response.json({ ok: false }, { status: 503, headers });
  }
};

export const GET = handler;
export const HEAD = handler;
