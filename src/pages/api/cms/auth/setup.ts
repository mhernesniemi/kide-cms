import type { APIRoute } from "astro";
import { nanoid } from "nanoid";

import { getDb } from "@/cms/core/db";
import { hashPassword, createSession, setSessionCookie } from "@/cms/core/auth";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const formData = await request.formData();
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (!name || !email || !password) {
    return new Response(null, {
      status: 303,
      headers: { Location: "/admin/setup?error=missing" },
    });
  }

  if (password !== confirmPassword) {
    return new Response(null, {
      status: 303,
      headers: { Location: "/admin/setup?error=password" },
    });
  }

  if (password.length < 8) {
    return new Response(null, {
      status: 303,
      headers: { Location: "/admin/setup?error=short" },
    });
  }

  const db = await getDb();
  const schema = await import("@/cms/.generated/schema");
  const tables = schema.cmsTables as Record<string, { main: any }>;

  if (!tables.users) {
    return Response.json({ error: "Users collection not configured." }, { status: 500 });
  }

  // Prevent setup if users already exist
  const existing = await db.select().from(tables.users.main).limit(1);
  if (existing.length > 0) {
    return new Response(null, {
      status: 303,
      headers: { Location: "/admin/login" },
    });
  }

  const id = nanoid();
  const now = new Date().toISOString();
  const hashedPassword = await hashPassword(password);

  await db.insert(tables.users.main).values({
    _id: id,
    name,
    email,
    password: hashedPassword,
    role: "admin",
    _createdAt: now,
    _updatedAt: now,
  });

  const session = await createSession(id);

  return new Response(null, {
    status: 303,
    headers: {
      Location: "/admin",
      "Set-Cookie": setSessionCookie(session.token, session.expiresAt),
    },
  });
};
