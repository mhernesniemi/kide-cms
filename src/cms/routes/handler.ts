import { kideMiddleware } from "../middleware/gate";
import type { CmsContext } from "./context";
import { createRouter } from "./router";
import { cmsRoutes } from "./table";

const router = createRouter(cmsRoutes);

/** Runs the Kide route matching this request, or returns null when none does. */
export const dispatchCmsRoute = (context: CmsContext) => router.dispatch(context);

/**
 * Full Kide request handling for hosts without route injection (SvelteKit's
 * `handle` hook): middleware for every request, Kide's own routes answered
 * directly, everything else passed to the host via `next`.
 */
export const handleKideRequest = (context: CmsContext, next: () => Promise<Response>) =>
  kideMiddleware(context, async () => (await dispatchCmsRoute(context)) ?? next());
