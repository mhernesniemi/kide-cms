import type { APIRoute } from "astro";

import { getSsoProvider, resolveAdminAuth } from "@/cms/core";
import config from "virtual:kide/config";

export const prerender = false;

export const GET: APIRoute = async ({ params, request }) => {
  const providerId = params.provider ?? "";
  const provider = getSsoProvider(config, providerId);
  if (!provider) return Response.json({ error: "SSO provider not found." }, { status: 404 });

  const auth = resolveAdminAuth(config);
  if (provider.authorizationUrl) {
    const url = new URL(provider.authorizationUrl);
    url.searchParams.set("provider", provider.id);
    url.searchParams.set(
      "redirect_uri",
      provider.callbackUrl ?? new URL("/api/cms/auth/sso/callback", request.url).toString(),
    );
    return new Response(null, {
      status: 303,
      headers: { Location: url.toString() },
    });
  }

  return Response.json(
    {
      error: `SSO provider "${provider.id}" is configured, but ${auth.provider} does not expose a start URL for it yet.`,
      hint: "Set authorizationUrl for a broker/custom flow, or use the Better Auth/WorkOS adapter when it is installed.",
    },
    { status: 501 },
  );
};
