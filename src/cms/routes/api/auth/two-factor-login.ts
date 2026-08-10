import type { APIRoute } from "astro";

import { getAuth } from "virtual:kide/runtime";

export const prerender = false;

const forwardCookies = (from: Headers, to: Headers) => {
  const cookies = typeof from.getSetCookie === "function" ? from.getSetCookie() : [from.get("set-cookie") ?? ""];
  for (const cookie of cookies) if (cookie) to.append("Set-Cookie", cookie);
};

/**
 * Completes a pending 2FA login: the browser holds Better Auth's pending-2FA cookie (set by
 * the login route), and posts the authenticator code here. We verify it through Better Auth
 * — which mints the real session on success — and forward that session cookie.
 */
export const POST: APIRoute = async ({ request }) => {
  const formData = await request.formData();
  const code = String(formData.get("code") ?? "").trim();
  const isBackup = String(formData.get("mode") ?? "") === "backup";
  if (!code) return new Response(null, { status: 303, headers: { Location: "/admin/two-factor?error=missing" } });

  const engine = await getAuth();
  const outHeaders = new Headers();
  try {
    const verify = isBackup ? engine.api.verifyBackupCode : engine.api.verifyTOTP;
    const result = (await verify({
      body: { code },
      headers: request.headers,
      returnHeaders: true,
    })) as { headers: Headers };
    forwardCookies(result.headers, outHeaders);
  } catch {
    return new Response(null, { status: 303, headers: { Location: "/admin/two-factor?error=invalid" } });
  }

  outHeaders.set("Location", "/admin");
  return new Response(null, { status: 303, headers: outHeaders });
};
