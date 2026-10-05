import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";

import { getDb } from "virtual:kide/db";
import { auditRequestMeta, hitRateLimit, logAudit } from "virtual:kide/runtime";
import {
  auditActor,
  enforcedSsoProvider,
  getAdminAuth,
  listSignInMethods,
  loadAuthUser,
  passwordResetDelivery,
  resolveAdminAuth,
} from "../../../core";
import config from "virtual:kide/config";
import { authResponse } from "./_better-auth";

export const prerender = false;

export const POST: APIRoute = async ({ request, clientAddress }) => {
  const auth = resolveAdminAuth(config);
  if (!auth.password.forgotPassword) return Response.json({ error: "Not found" }, { status: 404 });
  // No way to deliver a link: the page explains that instead of pretending to send one.
  if (!passwordResetDelivery()) {
    return new Response(null, { status: 303, headers: { Location: "/admin/forgot-password" } });
  }

  const formData = await request.formData();
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const redirect = () =>
    new Response(null, {
      status: 303,
      headers: { Location: "/admin/forgot-password?status=sent" },
    });

  if (!email) return redirect();
  // Domain-bound users have no password to recover; their provider is the way in.
  if (enforcedSsoProvider(auth, email)) return redirect();

  // Throttle by IP, then email. On limit, return the same "sent" response (never reveal)
  // and skip the email send — fail-open so a DB hiccup can't block recovery. Check the IP
  // bucket FIRST and return before touching the email bucket, so a blocked IP can't keep
  // inserting new limiter rows by varying the email.
  const opts = { max: 5, windowMs: 15 * 60 * 1000, failClosed: false };
  if (!(await hitRateLimit("forgot:ip", clientAddress, opts)).ok) return redirect();
  if (!(await hitRateLimit("forgot:email", email, opts)).ok) return redirect();

  const db = await getDb();
  const schema = await import("virtual:kide/schema");
  const tables = schema.cmsTables as Record<string, { main: any }>;
  if (!tables.users) return redirect();

  const rows = await db.select().from(tables.users.main).where(eq(tables.users.main.email, email)).limit(1);
  const user = rows.length > 0 ? await loadAuthUser(String((rows[0] as Record<string, unknown>)._id)) : null;
  const audit = () =>
    logAudit({
      action: "auth.password_reset_requested",
      resourceType: "password_reset",
      ...(user ? { actor: auditActor(user) } : { attemptedEmail: email }),
      ...auditRequestMeta(request),
    });

  if (!user) {
    audit();
    return redirect();
  }

  // SSO-only accounts don't get a password through the back door: their identity
  // provider (and its offboarding) stays the only way in. Invited users who haven't
  // accepted yet have no accounts at all and may reset.
  const methods = await listSignInMethods(user.id);
  if (methods.length > 0 && !methods.includes("credential")) {
    audit();
    return redirect();
  }

  const betterAuth = await getAdminAuth(request);
  await authResponse(() =>
    betterAuth.api.requestPasswordReset({
      body: { email, redirectTo: "/admin/reset-password" },
      headers: request.headers,
      asResponse: true,
    }),
  );
  audit();
  return redirect();
};
