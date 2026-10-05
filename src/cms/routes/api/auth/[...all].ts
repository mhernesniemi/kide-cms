import type { APIRoute } from "astro";

import { auditRequestMeta, hitRateLimit, logAudit } from "virtual:kide/runtime";
import config from "virtual:kide/config";
import {
  ADMIN_AUTH_BASE_PATH,
  applySsoRoleMapping,
  auditActor,
  extensionAuthEndpoints,
  getAdminAuth,
  getSsoProvider,
  loadAuthUser,
  markSsoVerified,
  mfaRequiredFor,
  resolveAdminAuth,
  resolveAdminSession,
} from "../../../core";
import { readJson } from "./_better-auth";

export const prerender = false;

// The part of Better Auth's HTTP surface the admin uses. Everything else (sign-up,
// email change, account deletion, …) stays unreachable; Kide's own routes cover
// password sign-in, reset and invites with its rate limits and audit trail.
const allowedEndpoint = (method: string, path: string) => {
  const auth = resolveAdminAuth(config);
  if (method === "GET" && /^\/callback\/[a-z0-9-]+$/.test(path)) return true;
  if (auth.mfa.totp && method === "POST") {
    if (
      [
        "/two-factor/enable",
        "/two-factor/disable",
        "/two-factor/verify-totp",
        "/two-factor/generate-backup-codes",
      ].includes(path)
    ) {
      return true;
    }
  }
  if (auth.mfa.passkeys) {
    if (
      method === "GET" &&
      [
        "/passkey/generate-register-options",
        "/passkey/generate-authenticate-options",
        "/passkey/list-user-passkeys",
      ].includes(path)
    ) {
      return true;
    }
    if (
      method === "POST" &&
      ["/passkey/verify-registration", "/passkey/verify-authentication", "/passkey/delete-passkey"].includes(path)
    ) {
      return true;
    }
  }
  // Plugins the project added through `admin.auth.betterAuth` bring their own endpoints.
  return extensionAuthEndpoints(config).some((rule) => rule.methods.includes(method) && rule.pattern.test(path));
};

const RATE_LIMITED = new Set(["/two-factor/verify-totp", "/passkey/verify-authentication"]);

const handle: APIRoute = async ({ request, clientAddress }) => {
  const url = new URL(request.url);
  const path = url.pathname.slice(ADMIN_AUTH_BASE_PATH.length);
  if (!allowedEndpoint(request.method, path)) return Response.json({ error: "Not found" }, { status: 404 });

  if (RATE_LIMITED.has(path)) {
    const limit = await hitRateLimit(`auth:${path}`, clientAddress, {
      max: 10,
      windowMs: 15 * 60 * 1000,
      failClosed: true,
    });
    if (!limit.ok) return Response.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }

  // `mfa.require` users can't switch their second factor off.
  if (path === "/two-factor/disable") {
    const session = await resolveAdminSession(request);
    if (session && mfaRequiredFor(resolveAdminAuth(config), session.user.role)) {
      return Response.json({ error: "Two-factor authentication is required for your role." }, { status: 403 });
    }
  }

  const auth = await getAdminAuth(request);
  const response = await auth.handler(request);

  if (path.startsWith("/callback/")) return finishSsoCallback(path.slice("/callback/".length), request, response);

  if (path === "/passkey/verify-authentication" && response.ok) {
    const body = await readJson(response);
    const userId = body?.session?.userId ?? body?.user?.id;
    logAudit({
      action: "auth.login",
      resourceType: "session",
      actor: auditActor(userId ? await loadAuthUser(String(userId)) : null),
      ...auditRequestMeta(request),
    });
    // The body carries the session token; the HttpOnly cookie is all the page needs.
    const ok = Response.json({ ok: true });
    for (const cookie of response.headers.getSetCookie()) ok.headers.append("Set-Cookie", cookie);
    return ok;
  }
  return response;
};

/**
 * Better Auth answers a refused SSO sign-in (not invited, wrong domain) with JSON, and an
 * OAuth error with a redirect. Either way the editor should land on the login page with a
 * readable message; on success, apply the provider's role mapping before entering.
 */
async function finishSsoCallback(providerId: string, request: Request, response: Response) {
  const location = response.headers.get("location");
  const isRedirect = response.status >= 300 && response.status < 400 && location;

  if (!isRedirect) {
    const body = await readJson(response);
    const code = String(body?.code ?? "sso_failed").toLowerCase();
    logAudit({ action: "auth.login_failed", resourceType: "session", ...auditRequestMeta(request) });
    return new Response(null, { status: 303, headers: { Location: `/admin/login?error=${encodeURIComponent(code)}` } });
  }

  const target = new URL(location, request.url);
  if (target.searchParams.has("error")) {
    logAudit({ action: "auth.login_failed", resourceType: "session", ...auditRequestMeta(request) });
    return response;
  }

  const provider = getSsoProvider(config, providerId);
  const sessionCookie = response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .find((cookie) => /^(?:__Secure-)?kide\.session_token=/.test(cookie));
  if (provider && sessionCookie) {
    const auth = await getAdminAuth(request);
    const session = await auth.api.getSession({ headers: new Headers({ cookie: sessionCookie }) });
    if (session) {
      await markSsoVerified(session.user.id, provider.id);
      await applySsoRoleMapping(provider, session.user.id);
      logAudit({
        action: "auth.login",
        resourceType: "session",
        actor: auditActor(await loadAuthUser(session.user.id)),
        ...auditRequestMeta(request),
      });
    }
  }
  return response;
}

export const GET = handle;
export const POST = handle;
