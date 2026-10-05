import type { APIRoute } from "astro";

import { auditRequestMeta, logAudit } from "virtual:kide/runtime";
import { auditActor, getAdminAuth, resolveAdminSession } from "../../../core";
import { authResponse } from "./_better-auth";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const session = await resolveAdminSession(request);
  const auth = await getAdminAuth(request);
  const response = await authResponse(() => auth.api.signOut({ headers: request.headers, asResponse: true }));

  logAudit({
    action: "auth.logout",
    resourceType: "session",
    actor: auditActor(session?.user ?? null),
    ...auditRequestMeta(request),
  });

  const contentType = request.headers.get("content-type") ?? "";
  const result = contentType.includes("application/json")
    ? Response.json({ ok: true })
    : new Response(null, { status: 303, headers: { Location: "/admin/login" } });
  for (const cookie of response.headers.getSetCookie()) result.headers.append("Set-Cookie", cookie);
  return result;
};
