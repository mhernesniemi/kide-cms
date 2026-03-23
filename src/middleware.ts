import { defineMiddleware } from "astro:middleware";
import { getSessionUser } from "./cms/core/auth";
import { getDb } from "./cms/core/db";

let hasUsers: boolean | null = null;

export const resetUserCache = () => {
  hasUsers = null;
};

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;

  // Skip auth for public pages and static assets
  const isAdminRoute = pathname.startsWith("/admin");
  const isAdminApiRoute = pathname.startsWith("/api/cms");
  const isLoginPage = pathname === "/admin/login";
  const isLoginApi = pathname === "/api/cms/auth/login";
  const isSetupPage = pathname === "/admin/setup";
  const isSetupApi = pathname === "/api/cms/auth/setup";

  if (!isAdminRoute && !isAdminApiRoute) {
    return next();
  }

  // Check if any users exist (cached after first check)
  if (hasUsers === null || !hasUsers) {
    try {
      const db = await getDb();
      const schema = await import("./cms/.generated/schema");
      const tables = schema.cmsTables as Record<string, { main: any }>;
      if (tables.users) {
        const rows = await db.select().from(tables.users.main).limit(1);
        hasUsers = rows.length > 0;
      } else {
        hasUsers = true;
      }
    } catch {
      // Tables may not exist yet (first run, schema not pushed)
      hasUsers = false;
    }
  }

  // No users yet — redirect to setup
  if (!hasUsers) {
    if (isSetupPage || isSetupApi) return next();
    if (isAdminApiRoute) {
      return new Response(JSON.stringify({ error: "Setup required" }), { status: 403 });
    }
    return context.redirect("/admin/setup");
  }

  // After setup, always allow setup API (it self-guards) but redirect setup page to login
  if (isSetupPage) {
    return context.redirect("/admin/login");
  }

  // Always allow login page, login API, and cron endpoint (has its own auth)
  const isCronApi = pathname === "/api/cms/cron/publish";
  if (isLoginPage || isLoginApi || isSetupApi || isCronApi) {
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
