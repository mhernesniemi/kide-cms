import type { APIRoute } from "astro";

import { cms } from "virtual:kide/api";

export const prerender = false;

const cmsRuntime = cms as Record<string, any> & { tasks: typeof cms.tasks };

const isAuthorized = (request: Request) => {
  const secret = import.meta.env.CRON_SECRET;
  if (!secret) return true;

  const authHeader = request.headers.get("authorization") ?? "";
  return authHeader === `Bearer ${secret}`;
};

const handler: APIRoute = async ({ request }) => {
  if (!isAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
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
