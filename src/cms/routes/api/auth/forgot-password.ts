import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";

import { getDb } from "virtual:kide/db";
import { auditRequestMeta, createPasswordReset, getEmail, recordAudit } from "virtual:kide/runtime";
import { resolveAdminAuth } from "@/cms/core";
import config from "virtual:kide/config";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
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

  const db = await getDb();
  const schema = await import("virtual:kide/schema");
  const tables = schema.cmsTables as Record<string, { main: any }>;
  if (!tables.users) return redirect();

  const rows = await db.select().from(tables.users.main).where(eq(tables.users.main.email, email)).limit(1);
  if (rows.length === 0) {
    void recordAudit({
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

  void recordAudit({
    action: "auth.password_reset_requested",
    resourceType: "password_reset",
    resourceId: reset.token,
    actor: {
      id: String(user._id),
      email: String(user.email ?? ""),
      role: String(user.role ?? ""),
    },
    ...auditRequestMeta(request),
  });

  return redirect();
};
