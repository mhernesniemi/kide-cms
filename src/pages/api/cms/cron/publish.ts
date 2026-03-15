import type { APIRoute } from "astro";

import { cms } from "../../../../cms/.generated/api";

export const prerender = false;

const cmsRuntime = cms as Record<string, any> & { scheduled: typeof cms.scheduled };

const isAuthorized = (request: Request) => {
  const secret = import.meta.env.CRON_SECRET;
  if (!secret) return true;

  const authHeader = request.headers.get("authorization") ?? "";
  return authHeader === `Bearer ${secret}`;
};

const handler: APIRoute = async ({ request, cache }) => {
  if (!isAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
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
