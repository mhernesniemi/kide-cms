import type { Handle } from "@sveltejs/kit/hooks";
import type { CmsContext, CmsLocals } from "../../routes/context";
import { redirect } from "../../routes/context";
import { handleKideRequest } from "../../routes/handler";

type WaitUntil = (promise: Promise<unknown>) => void;
type CfPlatform = { context?: { waitUntil?: WaitUntil } };

// adapter-cloudflare for Kit 3 passes no `platform`; on Workers, waitUntil comes from the
// runtime module instead. Variable specifier: keep it out of Node bundles' static graph.
const isWorker = typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers";
const workersModule = "cloudflare:workers";
let workersWaitUntil: Promise<WaitUntil | undefined> | undefined;
const getWorkersWaitUntil = () =>
  (workersWaitUntil ??= isWorker
    ? import(/* @vite-ignore */ workersModule).then((mod: { waitUntil?: WaitUntil }) => mod.waitUntil)
    : Promise.resolve(undefined));

/**
 * Kide's request handling as a SvelteKit `handle` hook: middleware for every
 * request, the admin / API / uploads answered directly, everything else resolved
 * by SvelteKit. Compose with your own hooks via `sequence()`.
 */
export const handle: Handle = async ({ event, resolve }) => {
  const locals = event.locals as CmsLocals;
  const platformContext = (event.platform as CfPlatform | undefined)?.context;
  const waitUntil = platformContext?.waitUntil
    ? (promise: Promise<unknown>) => platformContext.waitUntil!(promise)
    : await getWorkersWaitUntil();
  if (waitUntil) locals.cfContext = { waitUntil };

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
