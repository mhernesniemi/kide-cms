import type { APIRoute } from "astro";

import {
  auditRequestMeta,
  getAuth,
  peekRateLimit,
  recordAudit,
  recordRateLimit,
  clearRateLimit,
  tokenReference,
} from "virtual:kide/runtime";
import config from "virtual:kide/config";
import { resolveAdminAuth } from "@/cms/core";

export const prerender = false;

const MAX_ATTEMPTS = config.admin?.rateLimit?.maxAttempts ?? 5;
const WINDOW_MS = config.admin?.rateLimit?.windowMs ?? 15 * 60 * 1000;

/** Copy every Set-Cookie Better Auth emits onto an outgoing response. */
const forwardCookies = (from: Headers, to: Headers) => {
  const cookies = typeof from.getSetCookie === "function" ? from.getSetCookie() : [from.get("set-cookie") ?? ""];
  for (const cookie of cookies) if (cookie) to.append("Set-Cookie", cookie);
};

export const POST: APIRoute = async ({ request, clientAddress }) => {
  const contentType = request.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");
  const auth = resolveAdminAuth(config);

  const rateLimited = (retryAfterMs: number) => {
    if (isJson) {
      return Response.json(
        { error: "Too many login attempts. Try again later." },
        { status: 429, headers: { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) } },
      );
    }
    return new Response(null, { status: 303, headers: { Location: "/admin/login?error=rate-limited" } });
  };

  if (!auth.password.enabled) {
    if (isJson) return Response.json({ error: "Password login is disabled." }, { status: 404 });
    return new Response(null, { status: 303, headers: { Location: "/admin/login?error=disabled" } });
  }

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

  if (!email || !password) {
    if (isJson) return Response.json({ error: "Email and password are required." }, { status: 400 });
    return new Response(null, { status: 303, headers: { Location: "/admin/login?error=missing" } });
  }

  // Rate limit FAILED logins only: peek (read-only) before verifying, record on failure,
  // and clear the account budget on success. Both the client IP (spraying) and the email
  // (targeted) are throttled; a success never touches the IP bucket, so one valid credential
  // can't reset the throttle and keep spraying other accounts.
  const emailKey = email.toLowerCase();
  const opts = { max: MAX_ATTEMPTS, windowMs: WINDOW_MS, failClosed: true };
  const ipPeek = await peekRateLimit("login:ip", clientAddress, opts);
  if (!ipPeek.ok) return rateLimited(ipPeek.retryAfterMs);
  const emailPeek = await peekRateLimit("login:email", emailKey, opts);
  if (!emailPeek.ok) return rateLimited(emailPeek.retryAfterMs);

  const requestMeta = auditRequestMeta(request);
  const recordFailure = async () => {
    await recordRateLimit("login:ip", clientAddress, opts);
    await recordRateLimit("login:email", emailKey, opts);
    void recordAudit({ action: "auth.login_failed", resourceType: "session", attemptedEmail: email, ...requestMeta });
  };

  // Verify credentials and issue the session through Better Auth. It throws on bad
  // credentials (and disabled/locked accounts), which we treat uniformly as invalid.
  const engine = await getAuth();
  let result: { headers: Headers; response: { user: { id: string; email: string; role?: string }; token?: string } };
  try {
    result = (await engine.api.signInEmail({
      body: { email, password },
      returnHeaders: true,
    })) as typeof result;
  } catch {
    await recordFailure();
    if (isJson) return Response.json({ error: "Invalid credentials." }, { status: 401 });
    return new Response(null, { status: 303, headers: { Location: "/admin/login?error=invalid" } });
  }

  // Success — clear this account's failed-login budget (but not the IP bucket).
  await clearRateLimit("login:email", emailKey);

  const user = result.response.user;
  void recordAudit({
    action: "auth.login",
    resourceType: "session",
    resourceId: result.response.token ? await tokenReference(result.response.token) : undefined,
    actor: { id: user.id, email: user.email, role: String(user.role ?? "") },
    ...requestMeta,
  });

  const headers = new Headers();
  forwardCookies(result.headers, headers);
  if (isJson) {
    headers.set("Content-Type", "application/json");
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
  }
  headers.set("Location", "/admin");
  return new Response(null, { status: 303, headers });
};
