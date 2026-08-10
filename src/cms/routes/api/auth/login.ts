import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";

import { getDb } from "virtual:kide/db";
import {
  auditRequestMeta,
  createSession,
  recordAudit,
  setSessionCookie,
  tokenReference,
  verifyPassword,
} from "virtual:kide/runtime";
import config from "virtual:kide/config";
import { clearRateLimit, peekRateLimit, recordRateLimit, resolveAdminAuth } from "@/cms/core";

export const prerender = false;

const MAX_ATTEMPTS = config.admin?.rateLimit?.maxAttempts ?? 5;
const WINDOW_MS = config.admin?.rateLimit?.windowMs ?? 15 * 60 * 1000;

export const POST: APIRoute = async ({ request, clientAddress }) => {
  const contentType = request.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");
  const auth = resolveAdminAuth(config);

  const rateLimited = (retryAfterMs: number) => {
    if (isJson) {
      return Response.json(
        { error: "Too many login attempts. Try again later." },
        {
          status: 429,
          headers: { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) },
        },
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

  const recordFailure = async () => {
    await recordRateLimit("login:ip", clientAddress, opts);
    await recordRateLimit("login:email", emailKey, opts);
  };

  const db = await getDb();
  const schema = await import("virtual:kide/schema");
  const tables = schema.cmsTables as Record<string, { main: any }>;

  if (!tables.users) {
    return Response.json({ error: "Users collection not configured." }, { status: 500 });
  }

  const rows = await db.select().from(tables.users.main).where(eq(tables.users.main.email, email)).limit(1);
  const requestMeta = auditRequestMeta(request);

  if (rows.length === 0) {
    await recordFailure();
    void recordAudit({
      action: "auth.login_failed",
      resourceType: "session",
      attemptedEmail: email,
      ...requestMeta,
    });
    if (contentType.includes("application/json")) {
      return Response.json({ error: "Invalid credentials." }, { status: 401 });
    }
    return new Response(null, {
      status: 303,
      headers: { Location: "/admin/login?error=invalid" },
    });
  }

  const user = rows[0] as Record<string, unknown>;
  const storedHash = String(user.password ?? "");

  let valid = false;
  try {
    valid = await verifyPassword(storedHash, password);
  } catch {
    // valid remains false
  }

  if (!valid) {
    await recordFailure();
    void recordAudit({
      action: "auth.login_failed",
      resourceType: "session",
      attemptedEmail: email,
      ...requestMeta,
    });
    if (contentType.includes("application/json")) {
      return Response.json({ error: "Invalid credentials." }, { status: 401 });
    }
    return new Response(null, {
      status: 303,
      headers: { Location: "/admin/login?error=invalid" },
    });
  }

  // Success — clear this account's failed-login budget (but not the IP bucket).
  await clearRateLimit("login:email", emailKey);

  const session = await createSession(String(user._id));

  void recordAudit({
    action: "auth.login",
    resourceType: "session",
    resourceId: await tokenReference(session.token),
    actor: {
      id: String(user._id),
      email: String(user.email ?? ""),
      role: String(user.role ?? ""),
    },
    ...requestMeta,
  });

  if (contentType.includes("application/json")) {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": setSessionCookie(session.token, session.expiresAt),
      },
    });
  }

  return new Response(null, {
    status: 303,
    headers: {
      Location: "/admin",
      "Set-Cookie": setSessionCookie(session.token, session.expiresAt),
    },
  });
};
