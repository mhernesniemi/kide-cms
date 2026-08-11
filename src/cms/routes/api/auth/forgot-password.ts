import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";

import { getDb } from "virtual:kide/db";
import {
  auditRequestMeta,
  hitRateLimit,
  createPasswordReset,
  getEmail,
  logAudit,
  tokenReference,
} from "virtual:kide/runtime";
import { resolveAdminAuth } from "@/cms/core";
import config from "virtual:kide/config";

export const prerender = false;

export const POST: APIRoute = async ({ request, clientAddress }) => {
  const auth = resolveAdminAuth(config);
  if (!auth.password.forgotPassword) return Response.json({ error: "Not found" }, { status: 404 });

  const formData = await request.formData();
  const email = String(formData.get("email") ?? "").trim();
  const redirect = () =>
    new Response(null, {
      status: 303,
      headers: { Location: "/admin/forgot-password?status=sent" },
    });

  if (!email) return redirect();

  // Throttle by IP, then email. On limit, return the same "sent" response (never reveal)
  // and skip the email send — fail-open so a DB hiccup can't block recovery. Check the IP
  // bucket FIRST and return before touching the email bucket, so a blocked IP can't keep
  // inserting new limiter rows by varying the email.
  const opts = { max: 5, windowMs: 15 * 60 * 1000, failClosed: false };
  if (!(await hitRateLimit("forgot:ip", clientAddress, opts)).ok) return redirect();
  if (!(await hitRateLimit("forgot:email", email.toLowerCase(), opts)).ok) return redirect();

  const db = await getDb();
  const schema = await import("virtual:kide/schema");
  const tables = schema.cmsTables as Record<string, { main: any }>;
  if (!tables.users) return redirect();

  const rows = await db.select().from(tables.users.main).where(eq(tables.users.main.email, email)).limit(1);
  if (rows.length === 0) {
    logAudit({
      action: "auth.password_reset_requested",
      resourceType: "password_reset",
      attemptedEmail: email,
      ...auditRequestMeta(request),
    });
    return redirect();
  }

  const user = rows[0] as Record<string, unknown>;
  const reset = await createPasswordReset(String(user._id));
  const resetUrl = new URL("/admin/reset-password", request.url);
  resetUrl.searchParams.set("token", reset.token);

  const emailAdapter = getEmail();
  await emailAdapter.sendPasswordResetEmail?.(String(user.email), resetUrl.toString());

  logAudit({
    action: "auth.password_reset_requested",
    resourceType: "password_reset",
    resourceId: await tokenReference(reset.token),
    actor: {
      id: String(user._id),
      email: String(user.email ?? ""),
      role: String(user.role ?? ""),
    },
    ...auditRequestMeta(request),
  });

  return redirect();
};
