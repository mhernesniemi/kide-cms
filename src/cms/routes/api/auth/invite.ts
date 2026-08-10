import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";

import { getDb } from "virtual:kide/db";
import {
  auditRequestMeta,
  hitRateLimit,
  createInvite,
  consumeInvite,
  getAuth,
  setUserCredential,
  getSessionUser,
  recordAudit,
  tokenReference,
} from "virtual:kide/runtime";
import { sendInviteEmail, isEmailConfigured } from "virtual:kide/email";

export const prerender = false;

const forwardCookies = (from: Headers, to: Headers) => {
  const cookies = typeof from.getSetCookie === "function" ? from.getSetCookie() : [from.get("set-cookie") ?? ""];
  for (const cookie of cookies) if (cookie) to.append("Set-Cookie", cookie);
};

export const POST: APIRoute = async ({ request, url, clientAddress }) => {
  const formData = await request.formData();
  const action = String(formData.get("_action") ?? "create");

  if (action === "accept") {
    return handleAccept(formData, request, clientAddress);
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
  const schema = await import("virtual:kide/schema");
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
  const nowMs = new Date().getTime();

  // Credential-less user row; the invitee sets their password (into cms_accounts) on accept.
  await db.insert(tables.users.main).values({
    _id: id,
    name,
    email,
    role,
    createdAt: nowMs,
    updatedAt: nowMs,
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

async function handleAccept(formData: FormData, request: Request, clientAddress: string) {
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

  // Key on Astro's clientAddress (trusted), not the spoofable X-Forwarded-For header.
  const opts = { max: 10, windowMs: 15 * 60 * 1000, failClosed: true };
  const ipLimit = await hitRateLimit("invite:ip", clientAddress, opts);
  if (!ipLimit.ok) {
    return new Response(null, { status: 303, headers: { Location: "/admin/invite?error=invalid" } });
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

  // Consume as the atomic single-winner gate against a double-submit, then set the
  // credential and mint the session through Better Auth with the same password.
  const invite = await consumeInvite(token);
  if (!invite) {
    return new Response(null, {
      status: 303,
      headers: { Location: "/admin/invite?error=expired" },
    });
  }

  const db = await getDb();
  const schema = await import("virtual:kide/schema");
  const tables = schema.cmsTables as Record<string, { main: any }>;

  await db
    .update(tables.users.main)
    .set({ name, _updatedAt: new Date().toISOString() })
    .where(eq(tables.users.main._id, invite.userId));

  const acceptedUserRows = await db
    .select()
    .from(tables.users.main)
    .where(eq(tables.users.main._id, invite.userId))
    .limit(1);
  const acceptedUser = acceptedUserRows[0] as Record<string, unknown> | undefined;
  if (!acceptedUser) {
    return new Response(null, { status: 303, headers: { Location: "/admin/invite?error=expired" } });
  }

  await setUserCredential(invite.userId, password);
  const engine = await getAuth();
  const outHeaders = new Headers();
  try {
    const result = (await engine.api.signInEmail({
      body: { email: String(acceptedUser.email ?? ""), password },
      returnHeaders: true,
    })) as { headers: Headers };
    forwardCookies(result.headers, outHeaders);
  } catch {
    return new Response(null, { status: 303, headers: { Location: "/admin/login" } });
  }

  void recordAudit({
    action: "auth.invite_accepted",
    resourceType: "invite",
    resourceId: await tokenReference(token),
    actor: {
      id: String(acceptedUser._id),
      email: String(acceptedUser.email ?? ""),
      role: String(acceptedUser.role ?? ""),
    },
    ...auditRequestMeta(request),
  });

  outHeaders.set("Location", "/admin");
  return new Response(null, { status: 303, headers: outHeaders });
}
