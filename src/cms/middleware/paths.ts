/**
 * Whether the middleware treats a request as Kide's own (security headers, CSRF, session).
 * Kept free of runtime imports so tests can check it against the router: every path the
 * router dispatches to an admin page or API route must be guarded here.
 */
export const isGuardedPath = (pathname: string) =>
  (pathname.startsWith("/admin") || pathname.startsWith("/api/cms")) &&
  // Public despite the /api/cms prefix: cmsImageUrl() puts these URLs on public pages.
  // Only reads files under public/, which are served unauthenticated anyway.
  !pathname.startsWith("/api/cms/img/");
