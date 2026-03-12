import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";

import { getDb } from "@/cms/core/db";
import { verifyPassword, createSession, setSessionCookie } from "@/cms/core/auth";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const contentType = request.headers.get("content-type") ?? "";
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
  const schema = await import("@/cms/.generated/schema");
  const tables = schema.cmsTables as Record<string, { main: any }>;

  if (!tables.users) {
    return Response.json({ error: "Users collection not configured." }, { status: 500 });
  }

  const rows = await db
    .select()
    .from(tables.users.main)
    .where(eq(tables.users.main.email, email))
    .limit(1);

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
    valid = false;
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
