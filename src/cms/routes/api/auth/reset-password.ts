import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";

import { getDb } from "virtual:kide/db";
import {
  auditRequestMeta,
  hitRateLimit,
  consumePasswordReset,
  createSession,
  hashPassword,
  recordAudit,
  setSessionCookie,
} from "virtual:kide/runtime";
import { resolveAdminAuth } from "@/cms/core";
import config from "virtual:kide/config";

export const prerender = false;

const redirectWithError = (token: string, error: string) =>
  new Response(null, {
    status: 303,
    headers: { Location: `/admin/reset-password?token=${encodeURIComponent(token)}&error=${error}` },
  });

export const POST: APIRoute = async ({ request, clientAddress }) => {
  const auth = resolveAdminAuth(config);
  if (!auth.password.forgotPassword) return Response.json({ error: "Not found" }, { status: 404 });

  const ipLimit = await hitRateLimit("reset:ip", clientAddress, { max: 10, windowMs: 15 * 60 * 1000 });
  if (!ipLimit.ok) return redirectWithError("", "invalid");

  const formData = await request.formData();
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (!token || !password) return redirectWithError(token, "missing");
  if (password !== confirmPassword) return redirectWithError(token, "password");
  if (password.length < 8) return redirectWithError(token, "short");

  // Hash before claiming the token: the token is single-use, so anything fallible must run
  // before we burn it — otherwise a hashing failure would strand the account with a spent
  // token. Consume is then the atomic single-winner gate against double-submit.
  const hashedPassword = await hashPassword(password);
  const reset = await consumePasswordReset(token);
  if (!reset) return redirectWithError(token, "invalid");

  const db = await getDb();
  const schema = await import("virtual:kide/schema");
  const tables = schema.cmsTables as Record<string, { main: any }>;
  if (!tables.users) return redirectWithError(token, "invalid");

  const userRows = await db.select().from(tables.users.main).where(eq(tables.users.main._id, reset.userId)).limit(1);
  if (userRows.length === 0) return redirectWithError(token, "invalid");

  const user = userRows[0] as Record<string, unknown>;
  await db
    .update(tables.users.main)
    .set({ password: hashedPassword, _updatedAt: new Date().toISOString() })
    .where(eq(tables.users.main._id, reset.userId));
  await db.delete(schema.cmsSessions).where(eq(schema.cmsSessions.userId, reset.userId));

  const session = await createSession(reset.userId);

  void recordAudit({
    action: "auth.password_reset_completed",
    resourceType: "user",
    resourceCollection: "users",
    resourceId: reset.userId,
    actor: {
      id: reset.userId,
      email: String(user.email ?? ""),
      role: String(user.role ?? ""),
    },
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
