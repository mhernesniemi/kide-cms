import { defineMiddleware } from "astro:middleware";
import { getSessionUser } from "./cms/core/auth";
import { ready } from "./cms/.generated/api";

export const onRequest = defineMiddleware(async (context, next) => {
  // Ensure database is initialized and seeded before handling any request
  await ready;

  const { pathname } = context.url;

  // Skip auth for public pages, static assets, and the login route
  const isAdminRoute = pathname.startsWith("/admin");
  const isAdminApiRoute = pathname.startsWith("/api/cms");
  const isLoginPage = pathname === "/admin/login";
  const isLoginApi = pathname === "/api/cms/auth/login";

  if (!isAdminRoute && !isAdminApiRoute) {
    return next();
  }

  // Always allow login page and login API
  if (isLoginPage || isLoginApi) {
    return next();
  }

  const user = await getSessionUser(context.request);

  if (!user) {
    // API routes → 401
    if (isAdminApiRoute) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
    // Admin pages → redirect to login
    return context.redirect("/admin/login");
  }

  // Attach user to locals for downstream use
  context.locals.user = user;

  return next();
});
