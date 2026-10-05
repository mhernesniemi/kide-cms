import type { APIRoute } from "astro";

import { auditRequestMeta, logAudit } from "virtual:kide/runtime";
import config from "virtual:kide/config";
import {
  auditActor,
  clearRateLimit,
  enforcedSsoProvider,
  getAdminAuth,
  loadAuthUser,
  peekRateLimit,
  recordRateLimit,
  resolveAdminAuth,
} from "../../../core";
import { authResponse, readJson, redirectWithCookies } from "./_better-auth";

export const prerender = false;

const MAX_ATTEMPTS = config.admin?.rateLimit?.maxAttempts ?? 5;
const WINDOW_MS = config.admin?.rateLimit?.windowMs ?? 15 * 60 * 1000;

export const POST: APIRoute = async ({ request, clientAddress }) => {
  const contentType = request.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");
  const auth = resolveAdminAuth(config);

  const fail = (error: string, status: number, message: string, headers?: HeadersInit) =>
    isJson
      ? Response.json({ error: message }, { status, headers })
      : new Response(null, { status: 303, headers: { Location: `/admin/login?error=${error}` } });

  if (!auth.password.enabled) return fail("disabled", 404, "Password login is disabled.");

  let email: string;
  let password: string;
  if (isJson) {
    const body = await request.json();
    email = String(body.email ?? "");
    password = String(body.password ?? "");
  } else {
    const formData = await request.formData();
    email = String(formData.get("email") ?? "");
    password = String(formData.get("password") ?? "");
  }

  if (!email || !password) return fail("missing", 400, "Email and password are required.");

  // Domain-bound users sign in through their provider. Decided by domain alone, so it
  // reveals nothing about which accounts exist.
  const enforcing = enforcedSsoProvider(auth, email);
  if (enforcing) {
    return isJson
      ? Response.json({ error: `Sign in with ${enforcing.label}.`, sso: enforcing.id }, { status: 403 })
      : new Response(null, {
          status: 303,
          headers: { Location: `/admin/login?error=sso-required&sso=${enforcing.id}` },
        });
  }

  // Rate limit FAILED logins only: peek (read-only) before verifying, record on failure,
  // and clear the account budget on success. Both the client IP (spraying) and the email
  // (targeted) are throttled; a success never touches the IP bucket, so one valid credential
  // can't reset the throttle and keep spraying other accounts.
  const emailKey = email.toLowerCase();
  const opts = { max: MAX_ATTEMPTS, windowMs: WINDOW_MS, failClosed: true };
  for (const [bucket, key] of [
    ["login:ip", clientAddress],
    ["login:email", emailKey],
  ] as const) {
    const peek = await peekRateLimit(bucket, key, opts);
    if (!peek.ok) {
      return fail("rate-limited", 429, "Too many login attempts. Try again later.", {
        "Retry-After": String(Math.ceil(peek.retryAfterMs / 1000)),
      });
    }
  }

  const betterAuth = await getAdminAuth(request);
  const response = await authResponse(() =>
    betterAuth.api.signInEmail({
      body: { email, password, rememberMe: true },
      headers: request.headers,
      asResponse: true,
    }),
  );
  const body = await readJson(response);
  const requestMeta = auditRequestMeta(request);

  if (!response.ok) {
    await recordRateLimit("login:ip", clientAddress, opts);
    await recordRateLimit("login:email", emailKey, opts);
    logAudit({ action: "auth.login_failed", resourceType: "session", attemptedEmail: email, ...requestMeta });
    return fail("invalid", 401, "Invalid credentials.");
  }

  await clearRateLimit("login:email", emailKey);

  // Password accepted, second factor pending: Better Auth set a short-lived two-factor cookie.
  if (body?.twoFactorRedirect) {
    if (isJson) {
      const pending = Response.json({ twoFactorRequired: true });
      for (const cookie of response.headers.getSetCookie()) pending.headers.append("Set-Cookie", cookie);
      return pending;
    }
    return redirectWithCookies("/admin/login/verify", response);
  }

  const userId = (body?.user as { id?: string } | undefined)?.id;
  logAudit({
    action: "auth.login",
    resourceType: "session",
    actor: auditActor(userId ? await loadAuthUser(userId) : null),
    ...requestMeta,
  });

  if (isJson) {
    const ok = Response.json({ ok: true });
    for (const cookie of response.headers.getSetCookie()) ok.headers.append("Set-Cookie", cookie);
    return ok;
  }
  return redirectWithCookies("/admin", response);
};
