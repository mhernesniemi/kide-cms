import type { APIRoute } from "astro";

import { cms } from "virtual:kide/api";

import { isAuthorized, unauthorized } from "./_authorize";

export const prerender = false;

const cmsRuntime = cms as Record<string, any> & { tasks: typeof cms.tasks };

const handler: APIRoute = async ({ request }) => {
  if (!isAuthorized(request)) {
    return unauthorized();
  }

  const scheduled = await cmsRuntime.tasks.tick();
  const result = await cmsRuntime.tasks.drain();
  await cmsRuntime.tasks.prune();

  return Response.json({
    ok: true,
    scheduled,
    processed: result.processed,
    succeeded: result.succeeded,
    failed: result.failed,
    processedAt: new Date().toISOString(),
  });
};

export const GET = handler;
export const POST = handler;
