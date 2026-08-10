import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";

import { getDb } from "virtual:kide/db";
import {
  auditRequestMeta,
  hitRateLimit,
  consumePasswordReset,
  getAuth,
  recordAudit,
  setUserCredential,
} from "virtual:kide/runtime";
import { resolveAdminAuth } from "@/cms/core";
import config from "virtual:kide/config";

export const prerender = false;

const redirectWithError = (token: string, error: string) =>
  new Response(null, {
    status: 303,
    headers: { Location: `/admin/reset-password?token=${encodeURIComponent(token)}&error=${error}` },
  });

const forwardCookies = (from: Headers, to: Headers) => {
  const cookies = typeof from.getSetCookie === "function" ? from.getSetCookie() : [from.get("set-cookie") ?? ""];
  for (const cookie of cookies) if (cookie) to.append("Set-Cookie", cookie);
};

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

  // Consume is the atomic single-winner gate against double-submit.
  const reset = await consumePasswordReset(token);
  if (!reset) return redirectWithError(token, "invalid");

  const db = await getDb();
  const schema = await import("virtual:kide/schema");
  const tables = schema.cmsTables as Record<string, { main: any }>;
  if (!tables.users) return redirectWithError(token, "invalid");

  const userRows = await db.select().from(tables.users.main).where(eq(tables.users.main._id, reset.userId)).limit(1);
  if (userRows.length === 0) return redirectWithError(token, "invalid");
  const user = userRows[0] as Record<string, unknown>;

  // Replace the credential, revoke every existing session (so a reset kicks out anyone
  // holding the old password), then mint a fresh session for this browser.
  await setUserCredential(reset.userId, password);
  await db
    .update(tables.users.main)
    .set({ _updatedAt: new Date().toISOString() })
    .where(eq(tables.users.main._id, reset.userId));
  await db.delete(schema.cmsSessions).where(eq(schema.cmsSessions.userId, reset.userId));

  const engine = await getAuth();
  const outHeaders = new Headers();
  try {
    const result = (await engine.api.signInEmail({
      body: { email: String(user.email ?? ""), password },
      returnHeaders: true,
    })) as { headers: Headers };
    forwardCookies(result.headers, outHeaders);
  } catch {
    return new Response(null, { status: 303, headers: { Location: "/admin/login" } });
  }

  void recordAudit({
    action: "auth.password_reset_completed",
    resourceType: "user",
    resourceCollection: "users",
    resourceId: reset.userId,
    actor: { id: reset.userId, email: String(user.email ?? ""), role: String(user.role ?? "") },
    ...auditRequestMeta(request),
  });

  outHeaders.set("Location", "/admin");
  return new Response(null, { status: 303, headers: outHeaders });
};
