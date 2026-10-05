import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";

import { getDb } from "virtual:kide/db";
import {
  auditRequestMeta,
  hitRateLimit,
  createInvite,
  consumeInvite,
  validateInvite,
  hashPassword,
  logAudit,
  tokenReference,
} from "virtual:kide/runtime";
import { sendInviteEmail, isEmailConfigured } from "virtual:kide/email";
import config from "virtual:kide/config";
import {
  auditActor,
  enforcedSsoProvider,
  getAdminAuth,
  loadAuthUser,
  MIN_PASSWORD_LENGTH,
  publicOrigin,
  resolveAdminAuth,
  resolveAdminSession,
  setCredentialPassword,
} from "../../../core";
import { authResponse, redirectWithCookies } from "./_better-auth";

export const prerender = false;

const seeOther = (location: string) => new Response(null, { status: 303, headers: { Location: location } });

export const POST: APIRoute = async ({ request, clientAddress }) => {
  const formData = await request.formData();
  const action = String(formData.get("_action") ?? "create");

  if (action === "accept") {
    return handleAccept(formData, request, clientAddress);
  }

  return handleCreate(formData, request);
};

async function handleCreate(formData: FormData, request: Request) {
  const session = await resolveAdminSession(request);
  if (!session || session.user.role !== "admin") {
    return seeOther("/admin/users?_toast=error&_msg=Only+admins+can+invite+users");
  }

  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const role = String(formData.get("role") ?? "editor");
  const name = String(formData.get("name") ?? email.split("@")[0]).trim();

  if (!email) return seeOther("/admin/users/new?_toast=error&_msg=Email+is+required");

  const db = await getDb();
  const schema = await import("virtual:kide/schema");
  const tables = schema.cmsTables as Record<string, { main: any }>;
  if (!tables.users) return seeOther("/admin/users?_toast=error&_msg=Users+collection+not+configured");

  // Check for duplicate email
  const existing = await db.select().from(tables.users.main).where(eq(tables.users.main.email, email)).limit(1);
  if (existing.length > 0) {
    return seeOther("/admin/users/new?_toast=error&_msg=A+user+with+this+email+already+exists");
  }

  const { nanoid } = await import("nanoid");
  const id = nanoid();
  const now = new Date().toISOString();

  await db.insert(tables.users.main).values({
    _id: id,
    name,
    email,
    role,
    // The admin vouched for the address — SSO sign-ins may link to it.
    _authEmailVerified: true,
    _createdAt: now,
    _updatedAt: now,
  });

  // Without password sign-in (or for a domain bound to an SSO provider) there's nothing
  // to set up: the invitee signs in with SSO.
  const auth = resolveAdminAuth(config);
  const origin = publicOrigin(request);
  let inviteToken: string | null = null;
  let inviteUrl = `${origin}/admin/login`;
  if (auth.password.enabled && !enforcedSsoProvider(auth, email)) {
    inviteToken = (await createInvite(id)).token;
    inviteUrl = `${origin}/admin/invite?token=${encodeURIComponent(inviteToken)}`;
  }

  const emailSent = isEmailConfigured() ? await sendInviteEmail(email, inviteUrl) : false;

  const params = new URLSearchParams({
    _toast: "success",
    _msg: emailSent ? `Invitation sent to ${email}` : "User created",
    emailSent: String(emailSent),
  });
  if (inviteToken) params.set("inviteToken", inviteToken);
  else params.set("signInInvite", "1");

  return seeOther(`/admin/users/${id}?${params}`);
}

async function handleAccept(formData: FormData, request: Request, clientAddress: string) {
  const token = String(formData.get("token") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (!token) return seeOther("/admin/invite?error=invalid");

  // Key on Astro's clientAddress (trusted), not the spoofable X-Forwarded-For header.
  const opts = { max: 10, windowMs: 15 * 60 * 1000, failClosed: true };
  const ipLimit = await hitRateLimit("invite:ip", clientAddress, opts);
  if (!ipLimit.ok) return seeOther("/admin/invite?error=invalid");

  // The token is caller-supplied form input: encode it so it can't smuggle extra
  // query params or header-breaking characters into the redirect.
  const encodedToken = encodeURIComponent(token);

  if (!name || !password) return seeOther(`/admin/invite?token=${encodedToken}&error=missing`);
  if (password !== confirmPassword) return seeOther(`/admin/invite?token=${encodedToken}&error=password`);
  if (password.length < MIN_PASSWORD_LENGTH) return seeOther(`/admin/invite?token=${encodedToken}&error=short`);

  // An invite issued before the user's domain was bound to an SSO provider can't set a password.
  const pending = await validateInvite(token);
  const invitee = pending ? await loadAuthUser(pending.userId) : null;
  const enforcing = invitee ? enforcedSsoProvider(resolveAdminAuth(config), invitee.email) : null;
  if (enforcing) return seeOther(`/admin/login?error=sso-required&sso=${enforcing.id}`);

  // Hash before claiming: the token is single-use, so run the fallible work first, then
  // consume as the atomic single-winner gate against a double-submit.
  const hashedPassword = await hashPassword(password);
  const invite = await consumeInvite(token);
  if (!invite) return seeOther("/admin/invite?error=expired");

  const db = await getDb();
  const schema = await import("virtual:kide/schema");
  const tables = schema.cmsTables as Record<string, { main: any }>;

  await db
    .update(tables.users.main)
    .set({ name, _updatedAt: new Date().toISOString() })
    .where(eq(tables.users.main._id, invite.userId));
  await setCredentialPassword(invite.userId, hashedPassword);

  const acceptedUser = await loadAuthUser(invite.userId);
  logAudit({
    action: "auth.invite_accepted",
    resourceType: "invite",
    resourceId: await tokenReference(token),
    actor: auditActor(acceptedUser),
    ...auditRequestMeta(request),
  });

  if (!acceptedUser) return seeOther("/admin/login");
  const auth = await getAdminAuth(request);
  const signIn = await authResponse(() =>
    auth.api.signInEmail({
      body: { email: acceptedUser.email, password, rememberMe: true },
      headers: request.headers,
      asResponse: true,
    }),
  );
  return redirectWithCookies(signIn.ok ? "/admin" : "/admin/login", signIn);
}
