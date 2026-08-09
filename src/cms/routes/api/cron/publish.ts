import type { APIRoute } from "astro";

import { cms } from "virtual:kide/api";

import { isAuthorized, unauthorized } from "./_authorize";

export const prerender = false;

const cmsRuntime = cms as Record<string, any> & { scheduled: typeof cms.scheduled };

const handler: APIRoute = async ({ request, cache }) => {
  if (!isAuthorized(request)) {
    return unauthorized();
  }

  const result = await cmsRuntime.scheduled.processPublishing(cache);

  return Response.json({
    ok: true,
    published: result.published,
    unpublished: result.unpublished,
    processedAt: new Date().toISOString(),
  });
};

export const GET = handler;
export const POST = handler;
