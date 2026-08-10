import type { APIRoute } from "astro";

import { auditRequestMeta, getAuth, recordAudit } from "virtual:kide/runtime";

export const prerender = false;

/** Copy every Set-Cookie Better Auth emits (the cleared session cookie) onto our response. */
const forwardCookies = (from: Headers, to: Headers) => {
  const cookies = typeof from.getSetCookie === "function" ? from.getSetCookie() : [from.get("set-cookie") ?? ""];
  for (const cookie of cookies) if (cookie) to.append("Set-Cookie", cookie);
};

export const POST: APIRoute = async ({ request, locals }) => {
  // Better Auth revokes the current session (server-side) and returns the cleared cookie.
  const engine = await getAuth();
  const outHeaders = new Headers();
  try {
    const result = (await engine.api.signOut({
      headers: request.headers,
      returnHeaders: true,
    })) as { headers: Headers };
    forwardCookies(result.headers, outHeaders);
  } catch {
    // No active session — nothing to revoke; fall through and still redirect/clear.
  }

  const user = locals.user;
  void recordAudit({
    action: "auth.logout",
    resourceType: "session",
    actor: user ? { id: user.id, email: user.email, role: user.role } : null,
    ...auditRequestMeta(request),
  });

  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    outHeaders.set("Content-Type", "application/json");
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: outHeaders });
  }
  outHeaders.set("Location", "/admin/login");
  return new Response(null, { status: 303, headers: outHeaders });
};
