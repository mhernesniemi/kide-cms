import type { APIRoute } from "astro";

import { auditRequestMeta, hitRateLimit, logAudit } from "virtual:kide/runtime";
import { auditActor, getAdminAuth, loadAuthUser } from "../../../../core";
import { authResponse, readJson, redirectWithCookies } from "../_better-auth";

export const prerender = false;

export const POST: APIRoute = async ({ request, clientAddress }) => {
  const formData = await request.formData();
  const code = String(formData.get("code") ?? "").replace(/\s+/g, "");
  const useBackupCode = formData.get("method") === "backup";
  const trustDevice = formData.get("trustDevice") === "on";
  const back = (error: string) => `/admin/login/verify?error=${error}${useBackupCode ? "&method=backup" : ""}`;

  if (!code) return new Response(null, { status: 303, headers: { Location: back("missing") } });

  // Better Auth also locks the user's second factor after repeated failures.
  const limit = await hitRateLimit("two-factor:ip", clientAddress, {
    max: 10,
    windowMs: 15 * 60 * 1000,
    failClosed: true,
  });
  if (!limit.ok) return new Response(null, { status: 303, headers: { Location: back("rate-limited") } });

  const auth = await getAdminAuth(request);
  const response = await authResponse(() =>
    useBackupCode
      ? auth.api.verifyBackupCode({ body: { code, trustDevice }, headers: request.headers, asResponse: true })
      : auth.api.verifyTOTP({ body: { code, trustDevice }, headers: request.headers, asResponse: true }),
  );
  const body = await readJson(response);

  if (!response.ok) {
    logAudit({ action: "auth.login_failed", resourceType: "session", ...auditRequestMeta(request) });
    // Without the (10-minute) two-factor cookie the whole sign-in has to restart.
    const pending = /(?:^|;\s*)(?:__Secure-)?kide\.two_factor=/.test(request.headers.get("cookie") ?? "");
    const location = pending ? back("invalid") : "/admin/login?error=two-factor-expired";
    return new Response(null, { status: 303, headers: { Location: location } });
  }

  const userId = (body?.user as { id?: string } | undefined)?.id;
  logAudit({
    action: "auth.login",
    resourceType: "session",
    actor: auditActor(userId ? await loadAuthUser(userId) : null),
    ...auditRequestMeta(request),
  });
  return redirectWithCookies("/admin", response);
};
