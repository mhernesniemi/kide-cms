import type { APIRoute } from "astro";

import { cms } from "virtual:kide/api";

import { isAuthorized, unauthorized } from "./_authorize";
import { runTasksJob } from "./_jobs";

export const prerender = false;

const handler: APIRoute = async ({ request }) => {
  if (!isAuthorized(request)) {
    return unauthorized();
  }

  const result = await runTasksJob(cms as never);

  return Response.json({
    ok: true,
    scheduled: result.scheduled,
    processed: result.processed,
    succeeded: result.succeeded,
    failed: result.failed,
    processedAt: new Date().toISOString(),
  });
};

export const GET = handler;
export const POST = handler;
