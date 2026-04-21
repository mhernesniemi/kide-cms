import type { APIRoute } from "astro";

import { acquireLock, releaseLock } from "virtual:kide/runtime";

export const prerender = false;

const getSegments = (path: string | undefined) => (path ?? "").split("/").filter(Boolean);

// POST /api/cms/locks/:collection/:documentId — acquire/heartbeat or release (via ?_method=DELETE for sendBeacon)
export const POST: APIRoute = async ({ params, locals, url }) => {
  const [collection, documentId] = getSegments(params.path);
  const user = locals.user;

  if (!collection || !documentId || !user) {
    return Response.json({ error: "Missing parameters" }, { status: 400 });
  }

  if (url.searchParams.get("_method") === "DELETE") {
    await releaseLock(collection, documentId, user.id);
    return new Response(null, { status: 204 });
  }

  return Response.json(await acquireLock(collection, documentId, user.id, user.email));
};

// DELETE /api/cms/locks/:collection/:documentId — release lock
export const DELETE: APIRoute = async ({ params, locals }) => {
  const [collection, documentId] = getSegments(params.path);
  const user = locals.user;

  if (!collection || !documentId || !user) {
    return new Response(null, { status: 400 });
  }

  await releaseLock(collection, documentId, user.id);
  return new Response(null, { status: 204 });
};
