import type { APIRoute } from "astro";

import { getAuth } from "virtual:kide/runtime";
import { getSsoProvider } from "@/cms/core";
import config from "virtual:kide/config";

export const prerender = false;

const forwardCookies = (from: Headers, to: Headers) => {
  const cookies = typeof from.getSetCookie === "function" ? from.getSetCookie() : [from.get("set-cookie") ?? ""];
  for (const cookie of cookies) if (cookie) to.append("Set-Cookie", cookie);
};

export const GET: APIRoute = async ({ params, request }) => {
  const providerId = params.provider ?? "";
  const provider = getSsoProvider(config, providerId);
  if (!provider) return Response.json({ error: "SSO provider not found." }, { status: 404 });

  // OIDC/OAuth providers are handled by Better Auth's generic-oauth plugin. Ask it for the
  // IdP authorization URL (which also sets the state/PKCE cookie), then 302 the browser there,
  // forwarding that Set-Cookie so the callback can validate state.
  if (provider.type === "oidc" || provider.type === "oauth") {
    const engine = await getAuth();
    try {
      const result = (await engine.api.signInWithOAuth2({
        body: { providerId, callbackURL: "/admin", errorCallbackURL: "/admin/login?error=sso", disableRedirect: true },
        headers: request.headers,
        returnHeaders: true,
      })) as { headers: Headers; response: { url?: string } };

      const url = result.response?.url;
      if (!url) return new Response(null, { status: 303, headers: { Location: "/admin/login?error=sso" } });

      const headers = new Headers({ Location: url });
      forwardCookies(result.headers, headers);
      return new Response(null, { status: 303, headers });
    } catch {
      return new Response(null, { status: 303, headers: { Location: "/admin/login?error=sso" } });
    }
  }

  // Non-OIDC brokers (SAML/WorkOS/custom) can still supply an explicit authorization URL.
  if (provider.authorizationUrl) {
    const url = new URL(provider.authorizationUrl);
    url.searchParams.set(
      "redirect_uri",
      provider.callbackUrl ?? new URL("/api/cms/auth/sso/callback", request.url).toString(),
    );
    return new Response(null, { status: 303, headers: { Location: url.toString() } });
  }

  return Response.json(
    {
      error: `SSO provider "${provider.id}" (type "${provider.type}") has no start URL. Use type "oidc" with an issuer, or set authorizationUrl for a custom broker flow.`,
    },
    { status: 501 },
  );
};
