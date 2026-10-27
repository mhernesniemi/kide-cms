import type { APIRoute } from "astro";

import { cms } from "virtual:kide/api";

import { isAuthorized, unauthorized } from "./_authorize";
import { runPublishJob } from "./_jobs";

export const prerender = false;

const handler: APIRoute = async ({ request, cache }) => {
  if (!isAuthorized(request)) {
    return unauthorized();
  }

  const result = await runPublishJob(cms as never, cache);

  return Response.json({
    ok: true,
    published: result.published,
    unpublished: result.unpublished,
    processedAt: new Date().toISOString(),
  });
};

export const GET = handler;
export const POST = handler;
