import type { Handle } from "@sveltejs/kit/hooks";
import type { CmsContext, CmsLocals } from "../../routes/context";
import { redirect } from "../../routes/context";
import { handleKideRequest } from "../../routes/handler";

type CfPlatform = { context?: { waitUntil?: (promise: Promise<unknown>) => void } };

/**
 * Kide's request handling as a SvelteKit `handle` hook: middleware for every
 * request, the admin / API / uploads answered directly, everything else resolved
 * by SvelteKit. Compose with your own hooks via `sequence()`.
 */
export const handle: Handle = ({ event, resolve }) => {
  const locals = event.locals as CmsLocals;
  const cfContext = (event.platform as CfPlatform | undefined)?.context;
  if (cfContext?.waitUntil) locals.cfContext = { waitUntil: (promise) => cfContext.waitUntil!(promise) };

  const context: CmsContext = {
    request: event.request,
    url: event.url,
    params: {},
    locals,
    get clientAddress() {
      return event.getClientAddress();
    },
    redirect,
  };

  return handleKideRequest(context, () => resolve(event), {
    "/api/cms/preview/render": async ({ request }) => (await import("./preview")).renderPreview(request),
  });
};
