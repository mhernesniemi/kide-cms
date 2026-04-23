import type { APIRoute } from "astro";

import { auditRequestMeta, clearSessionCookie, destroySession, recordAudit } from "virtual:kide/runtime";

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const match = cookieHeader.match(/cms_session=([^;]+)/);

  if (match) {
    await destroySession(match[1]);
  }

  const user = locals.user;
  void recordAudit({
    action: "auth.logout",
    resourceType: "session",
    resourceId: match ? match[1] : null,
    actor: user ? { id: user.id, email: user.email, role: user.role } : null,
    ...auditRequestMeta(request),
  });

  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": clearSessionCookie(),
      },
    });
  }

  return new Response(null, {
    status: 303,
    headers: {
      Location: "/admin/login",
      "Set-Cookie": clearSessionCookie(),
    },
  });
};
