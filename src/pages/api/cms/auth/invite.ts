import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";

import { getDb } from "@/cms/core/db";
import {
  createInvite,
  validateInvite,
  consumeInvite,
  hashPassword,
  createSession,
  setSessionCookie,
  getSessionUser,
} from "@/cms/core/auth";
import { sendInviteEmail, isEmailConfigured } from "@/cms/core/email";

export const prerender = false;

export const POST: APIRoute = async ({ request, url, locals }) => {
  const formData = await request.formData();
  const action = String(formData.get("_action") ?? "create");

  if (action === "accept") {
    return handleAccept(formData);
  }

  return handleCreate(formData, url, request);
};

async function handleCreate(formData: FormData, url: URL, request: Request) {
  const user = await getSessionUser(request);
  if (!user || user.role !== "admin") {
    return new Response(null, {
      status: 303,
      headers: { Location: "/admin/users?_toast=error&_msg=Only+admins+can+invite+users" },
    });
  }

  const email = String(formData.get("email") ?? "").trim();
  const role = String(formData.get("role") ?? "editor");
  const name = String(formData.get("name") ?? email.split("@")[0]).trim();

  if (!email) {
    return new Response(null, {
      status: 303,
      headers: { Location: "/admin/users/new?_toast=error&_msg=Email+is+required" },
    });
  }

  const db = await getDb();
  const schema = await import("@/cms/.generated/schema");
  const tables = schema.cmsTables as Record<string, { main: any }>;
  if (!tables.users) {
    return new Response(null, {
      status: 303,
      headers: { Location: "/admin/users?_toast=error&_msg=Users+collection+not+configured" },
    });
  }

  // Check for duplicate email
  const existing = await db.select().from(tables.users.main).where(eq(tables.users.main.email, email)).limit(1);
  if (existing.length > 0) {
    return new Response(null, {
      status: 303,
      headers: { Location: "/admin/users/new?_toast=error&_msg=A+user+with+this+email+already+exists" },
    });
  }

  const { nanoid } = await import("nanoid");
  const id = nanoid();
  const now = new Date().toISOString();

  await db.insert(tables.users.main).values({
    _id: id,
    name,
    email,
    password: "",
    role,
    _createdAt: now,
    _updatedAt: now,
  });

  const invite = await createInvite(id);
  const inviteUrl = `${url.origin}/admin/invite?token=${invite.token}`;

  let emailSent = false;
  if (isEmailConfigured()) {
    emailSent = await sendInviteEmail(email, inviteUrl);
  }

  const params = new URLSearchParams({
    _toast: "success",
    _msg: emailSent ? `Invitation sent to ${email}` : "User created",
    inviteToken: invite.token,
    emailSent: String(emailSent),
  });

  return new Response(null, {
    status: 303,
    headers: { Location: `/admin/users/${id}?${params}` },
  });
}

async function handleAccept(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (!token) {
    return new Response(null, {
      status: 303,
      headers: { Location: "/admin/invite?error=invalid" },
    });
  }

  if (!name || !password) {
    return new Response(null, {
      status: 303,
      headers: { Location: `/admin/invite?token=${token}&error=missing` },
    });
  }

  if (password !== confirmPassword) {
    return new Response(null, {
      status: 303,
      headers: { Location: `/admin/invite?token=${token}&error=password` },
    });
  }

  if (password.length < 8) {
    return new Response(null, {
      status: 303,
      headers: { Location: `/admin/invite?token=${token}&error=short` },
    });
  }

  const invite = await validateInvite(token);
  if (!invite) {
    return new Response(null, {
      status: 303,
      headers: { Location: "/admin/invite?error=expired" },
    });
  }

  const db = await getDb();
  const schema = await import("@/cms/.generated/schema");
  const tables = schema.cmsTables as Record<string, { main: any }>;

  const hashedPassword = await hashPassword(password);
  await db
    .update(tables.users.main)
    .set({ name, password: hashedPassword, _updatedAt: new Date().toISOString() })
    .where(eq(tables.users.main._id, invite.userId));

  await consumeInvite(token);

  const session = await createSession(invite.userId);

  return new Response(null, {
    status: 303,
    headers: {
      Location: "/admin",
      "Set-Cookie": setSessionCookie(session.token, session.expiresAt),
    },
  });
}
