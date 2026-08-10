import type { APIRoute } from "astro";
import { eq, sql } from "drizzle-orm";
import { nanoid } from "nanoid";

import { getDb } from "virtual:kide/db";
import { auditRequestMeta, getAuth, hitRateLimit, recordAudit, setUserCredential } from "virtual:kide/runtime";

export const prerender = false;

const forwardCookies = (from: Headers, to: Headers) => {
  const cookies = typeof from.getSetCookie === "function" ? from.getSetCookie() : [from.get("set-cookie") ?? ""];
  for (const cookie of cookies) if (cookie) to.append("Set-Cookie", cookie);
};

export const POST: APIRoute = async ({ request, clientAddress }) => {
  const ipLimit = await hitRateLimit("setup:ip", clientAddress, {
    max: 10,
    windowMs: 15 * 60 * 1000,
    failClosed: true,
  });
  if (!ipLimit.ok) {
    return new Response(null, { status: 303, headers: { Location: "/admin/setup?error=missing" } });
  }

  const formData = await request.formData();
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (!name || !email || !password) {
    return new Response(null, { status: 303, headers: { Location: "/admin/setup?error=missing" } });
  }
  if (password !== confirmPassword) {
    return new Response(null, { status: 303, headers: { Location: "/admin/setup?error=password" } });
  }
  if (password.length < 8) {
    return new Response(null, { status: 303, headers: { Location: "/admin/setup?error=short" } });
  }

  const db = await getDb();
  const schema = await import("virtual:kide/schema");
  const tables = schema.cmsTables as Record<string, { main: any }>;
  if (!tables.users) {
    return Response.json({ error: "Users collection not configured." }, { status: 500 });
  }

  // Prevent setup if users already exist (fast path / friendly redirect).
  const existing = await db.select().from(tables.users.main).limit(1);
  if (existing.length > 0) {
    return new Response(null, { status: 303, headers: { Location: "/admin/login" } });
  }

  const id = nanoid();
  const nowIso = new Date().toISOString();
  const nowMs = new Date().getTime();

  // Atomic winner election that leaves no orphan state: a single conditional insert creates
  // the first admin only if the table is still empty. Self-recovering — if anything fails
  // there's no marker to strand setup, and a retry just runs the same guarded insert. The
  // credential itself lives in cms_accounts (written after we confirm we won the race).
  await db.run(sql`
    INSERT INTO cms_users (_id, name, email, role, email_verified, created_at, updated_at, _created_at, _updated_at)
    SELECT ${id}, ${name}, ${email}, 'admin', 1, ${nowMs}, ${nowMs}, ${nowIso}, ${nowIso}
    WHERE NOT EXISTS (SELECT 1 FROM cms_users)
  `);

  // Confirm we won the race (our row exists). If not, another concurrent setup created the
  // first admin — send this request to login.
  const mine = await db.select().from(tables.users.main).where(eq(tables.users.main._id, id)).limit(1);
  if (mine.length === 0) {
    return new Response(null, { status: 303, headers: { Location: "/admin/login" } });
  }

  // Establish the credential, then mint the session through Better Auth with the same password.
  await setUserCredential(id, password);
  const engine = await getAuth();
  const outHeaders = new Headers();
  try {
    const result = (await engine.api.signInEmail({
      body: { email, password },
      returnHeaders: true,
    })) as { headers: Headers };
    forwardCookies(result.headers, outHeaders);
  } catch {
    // Credential set but auto-login failed for some reason — send them to log in manually.
    return new Response(null, { status: 303, headers: { Location: "/admin/login" } });
  }

  void recordAudit({
    action: "auth.setup_completed",
    resourceType: "user",
    resourceCollection: "users",
    resourceId: id,
    actor: { id, email, role: "admin" },
    ...auditRequestMeta(request),
  });

  outHeaders.set("Location", "/admin");
  return new Response(null, { status: 303, headers: outHeaders });
};
