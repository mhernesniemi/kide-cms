import type { APIRoute } from "astro";

import { auditRequestMeta, hitRateLimit, logAudit } from "virtual:kide/runtime";
import { auditActor, getAdminAuth, MIN_PASSWORD_LENGTH, resolveAdminSession } from "../../../core";
import { authResponse, redirectWithCookies } from "./_better-auth";

export const prerender = false;

const back = (params: Record<string, string>) =>
  new Response(null, { status: 303, headers: { Location: `/admin/account?${new URLSearchParams(params)}` } });

export const POST: APIRoute = async ({ request }) => {
  const session = await resolveAdminSession(request);
  if (!session) return new Response(null, { status: 303, headers: { Location: "/admin/login" } });

  const formData = await request.formData();
  const action = String(formData.get("_action") ?? "");
  const auth = await getAdminAuth(request);

  if (action === "change-password") {
    const limit = await hitRateLimit("account:password", session.user.id, { max: 10, windowMs: 15 * 60 * 1000 });
    if (!limit.ok) return back({ _toast: "error", _msg: "Too many attempts. Try again later." });

    const currentPassword = String(formData.get("currentPassword") ?? "");
    const newPassword = String(formData.get("newPassword") ?? "");
    const confirmPassword = String(formData.get("confirmPassword") ?? "");
    if (!currentPassword || !newPassword) return back({ _toast: "error", _msg: "Fill in every password field." });
    if (newPassword !== confirmPassword) return back({ _toast: "error", _msg: "The new passwords don't match." });
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      return back({ _toast: "error", _msg: `Use at least ${MIN_PASSWORD_LENGTH} characters.` });
    }

    const response = await authResponse(() =>
      auth.api.changePassword({
        body: { currentPassword, newPassword, revokeOtherSessions: true },
        headers: request.headers,
        asResponse: true,
      }),
    );
    if (!response.ok) return back({ _toast: "error", _msg: "Your current password is incorrect." });

    logAudit({
      action: "auth.password_changed",
      resourceType: "user",
      resourceCollection: "users",
      resourceId: session.user.id,
      actor: auditActor(session.user),
      ...auditRequestMeta(request),
    });
    // Revoking other sessions re-issues this one — keep the new cookie.
    return redirectWithCookies(
      `/admin/account?${new URLSearchParams({ _toast: "success", _msg: "Password changed. Other devices were signed out." })}`,
      response,
    );
  }

  if (action === "revoke-other-sessions") {
    await authResponse(() => auth.api.revokeOtherSessions({ headers: request.headers, asResponse: true }));
    logAudit({
      action: "auth.sessions_revoked",
      resourceType: "session",
      actor: auditActor(session.user),
      ...auditRequestMeta(request),
    });
    return back({ _toast: "success", _msg: "Signed out on every other device." });
  }

  return back({ _toast: "error", _msg: "Unknown action." });
};
