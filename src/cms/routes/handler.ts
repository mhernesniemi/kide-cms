import { kideMiddleware } from "../middleware/gate";
import type { CmsContext } from "./context";
import { createRouter } from "./router";
import { cmsRoutes } from "./table";

const router = createRouter(cmsRoutes);

/** Runs the Kide route matching this request, or returns null when none does. */
export const dispatchCmsRoute = (context: CmsContext) => router.dispatch(context);

export { kideMiddleware };

/**
 * Full Kide request handling for hosts without route injection (SvelteKit's
 * `handle` hook): middleware for every request, Kide's own routes answered
 * directly, everything else passed to the host via `next`. `hostRoutes` answers
 * paths the host renders itself (live preview) before Kide's catch-alls see them.
 */
export const handleKideRequest = (
  context: CmsContext,
  next: () => Promise<Response>,
  hostRoutes: Record<string, (context: CmsContext) => Promise<Response>> = {},
) =>
  kideMiddleware(context, async () => {
    const hostRoute = hostRoutes[context.url.pathname];
    if (hostRoute) return hostRoute(context);
    return (await dispatchCmsRoute(context)) ?? next();
  });
