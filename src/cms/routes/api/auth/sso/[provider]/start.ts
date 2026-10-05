import type { APIRoute } from "astro";

import { hitRateLimit } from "virtual:kide/runtime";
import config from "virtual:kide/config";
import { getAdminAuth, getSsoProvider } from "../../../../../core";
import { authResponse, readJson, redirectWithCookies } from "../../_better-auth";

export const prerender = false;

const toLogin = (error: string) =>
  new Response(null, { status: 303, headers: { Location: `/admin/login?error=${error}` } });

// Only same-site admin paths: a returnTo is attacker-controllable via a crafted link.
const safeReturnTo = (value: string | null) =>
  value && /^\/admin(?:[/?#]|$)/.test(value) && !value.startsWith("//") ? value : "/admin";

export const GET: APIRoute = async ({ params, request, url, clientAddress }) => {
  const provider = getSsoProvider(config, params.provider ?? "");
  if (!provider) return toLogin("sso-unknown");

  const limit = await hitRateLimit("sso:ip", clientAddress, { max: 30, windowMs: 15 * 60 * 1000 });
  if (!limit.ok) return toLogin("rate-limited");

  const auth = await getAdminAuth(request);
  const response = await authResponse(() =>
    auth.api.signInSocial({
      body: {
        provider: provider.id,
        callbackURL: safeReturnTo(url.searchParams.get("returnTo")),
        errorCallbackURL: "/admin/login",
      },
      headers: request.headers,
      asResponse: true,
    }),
  );
  const body = await readJson(response);
  if (!response.ok || typeof body?.url !== "string") {
    console.error(`[kide] SSO provider "${provider.id}" could not start sign-in:`, body?.message ?? response.status);
    return toLogin("sso-unavailable");
  }
  // Carries the OAuth state / PKCE cookies the callback checks.
  return redirectWithCookies(body.url, response);
};
