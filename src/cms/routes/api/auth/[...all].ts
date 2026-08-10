import type { APIRoute } from "astro";

import { getAuth } from "virtual:kide/runtime";

export const prerender = false;

// Better Auth owns every endpoint under /api/cms/auth/* (sign-in, sign-out, callbacks,
// reset, verification, MFA, OAuth). Delegate the raw Request to its handler.
const handler: APIRoute = async ({ request }) => {
  const auth = await getAuth();
  return auth.handler(request);
};

export const GET = handler;
export const POST = handler;
