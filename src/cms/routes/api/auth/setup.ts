import type { APIRoute } from "astro";
import { eq, sql } from "drizzle-orm";
import { nanoid } from "nanoid";

import { getDb } from "virtual:kide/db";
import {
  auditRequestMeta,
  hitRateLimit,
  createSession,
  hashPassword,
  logAudit,
  setSessionCookie,
} from "virtual:kide/runtime";
import { MIN_PASSWORD_LENGTH } from "../../../core";

export const prerender = false;

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
    return new Response(null, {
      status: 303,
      headers: { Location: "/admin/setup?error=missing" },
    });
  }

  if (password !== confirmPassword) {
    return new Response(null, {
      status: 303,
      headers: { Location: "/admin/setup?error=password" },
    });
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    return new Response(null, {
      status: 303,
      headers: { Location: "/admin/setup?error=short" },
    });
  }

  const db = await getDb();
  const schema = await import("virtual:kide/schema");
  const tables = schema.cmsTables as Record<string, { main: any }>;

  if (!tables.users) {
    return Response.json({ error: "Users collection not configured." }, { status: 500 });
  }

  // Prevent setup if an admin already exists (fast path / friendly redirect).
  // Deliberately admin-scoped: seeded demo editors, or an invite that created an
  // editor first, must not strand a project with no way to make its first admin.
  const existing = await db.select().from(tables.users.main).where(eq(tables.users.main.role, "admin")).limit(1);
  if (existing.length > 0) {
    return new Response(null, {
      status: 303,
      headers: { Location: "/admin/login" },
    });
  }

  const id = nanoid();
  const now = new Date().toISOString();
  const hashedPassword = await hashPassword(password);

  // Atomic winner election that leaves no orphan state: a single conditional insert creates
  // the first admin only if none exists yet. Self-recovering — if anything fails there's no
  // marker to strand setup, and a retry just runs the same guarded insert.
  await db.run(sql`
    INSERT INTO cms_users (_id, name, email, role, password, _created_at, _updated_at)
    SELECT ${id}, ${name}, ${email}, 'admin', ${hashedPassword}, ${now}, ${now}
    WHERE NOT EXISTS (SELECT 1 FROM cms_users WHERE role = 'admin')
  `);

  // Confirm we won the race (our row exists). If not, another concurrent setup created the
  // first admin — send this request to login.
  const mine = await db.select().from(tables.users.main).where(eq(tables.users.main._id, id)).limit(1);
  if (mine.length === 0) {
    return new Response(null, { status: 303, headers: { Location: "/admin/login" } });
  }

  const session = await createSession(id);

  logAudit({
    action: "auth.setup_completed",
    resourceType: "user",
    resourceCollection: "users",
    resourceId: id,
    actor: { id, email, role: "admin" },
    ...auditRequestMeta(request),
  });

  return new Response(null, {
    status: 303,
    headers: {
      Location: "/admin",
      "Set-Cookie": setSessionCookie(session.token, session.expiresAt),
    },
  });
};
