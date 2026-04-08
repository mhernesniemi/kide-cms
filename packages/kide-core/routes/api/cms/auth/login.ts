import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";

import { getDb } from "virtual:kide/db";
import { verifyPassword, createSession, setSessionCookie } from "virtual:kide/runtime";

export const prerender = false;

// Simple in-memory rate limiter: max 5 attempts per 15 minutes per IP
const attempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = attempts.get(ip);
  if (!entry || now > entry.resetAt) {
    attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  entry.count++;
  return entry.count > MAX_ATTEMPTS;
}

export const POST: APIRoute = async ({ request, clientAddress }) => {
  const contentType = request.headers.get("content-type") ?? "";

  if (isRateLimited(clientAddress)) {
    if (contentType.includes("application/json")) {
      return Response.json({ error: "Too many login attempts. Try again later." }, { status: 429 });
    }
    return new Response(null, {
      status: 303,
      headers: { Location: "/admin/login?error=rate-limited" },
    });
  }

  let email: string;
  let password: string;

  if (contentType.includes("application/json")) {
    const body = await request.json();
    email = String(body.email ?? "");
    password = String(body.password ?? "");
  } else {
    const formData = await request.formData();
    email = String(formData.get("email") ?? "");
    password = String(formData.get("password") ?? "");
  }

  if (!email || !password) {
    if (contentType.includes("application/json")) {
      return Response.json({ error: "Email and password are required." }, { status: 400 });
    }
    return new Response(null, {
      status: 303,
      headers: { Location: "/admin/login?error=missing" },
    });
  }

  const db = await getDb();
  const schema = await import("virtual:kide/schema");
  const tables = schema.cmsTables as Record<string, { main: any }>;

  if (!tables.users) {
    return Response.json({ error: "Users collection not configured." }, { status: 500 });
  }

  const rows = await db.select().from(tables.users.main).where(eq(tables.users.main.email, email)).limit(1);

  if (rows.length === 0) {
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
    if (contentType.includes("application/json")) {
      return Response.json({ error: "Invalid credentials." }, { status: 401 });
    }
    return new Response(null, {
      status: 303,
      headers: { Location: "/admin/login?error=invalid" },
    });
  }

  // Successful login — clear rate limit
  attempts.delete(clientAddress);

  const session = await createSession(String(user._id));

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
