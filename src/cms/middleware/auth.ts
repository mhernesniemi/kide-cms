import { defineMiddleware } from "astro:middleware";
import type { APIContext, MiddlewareNext } from "astro";
import { readEnv, resolveAdminAuth, runWithRequestScope } from "@/cms/core";
import type { RequestScope, SessionUser } from "@/cms/core";
import config from "virtual:kide/config";
import { getSessionUser } from "virtual:kide/runtime";
import { getDb } from "virtual:kide/db";

let hasUsers: boolean | null = null;

export const resetUserCache = () => {
  hasUsers = null;
};

const normalizeCustomUser = (value: Record<string, unknown> | null): SessionUser | null => {
  if (!value || typeof value.id !== "string" || typeof value.email !== "string") return null;
  return {
    ...value,
    id: value.id,
    email: value.email,
    name: typeof value.name === "string" ? value.name : value.email,
    role: typeof value.role === "string" ? value.role : "editor",
  };
};

export const onRequest = defineMiddleware(async (context, next) => {
  // Establish a per-request scope for EVERY request (including public pages and custom public
  // API routes) so deferred work (audit/search/webhook-enqueue) is kept alive only for THIS
  // request — never routed to the module-level script fallback, whose promises aren't attached
  // to any waitUntil on Cloudflare. On Cloudflare defer = cfContext.waitUntil (locals.runtime.ctx
  // throws on Astro 7); on Node it's a no-op (the process stays alive regardless).
  const cfContext = (context.locals as { cfContext?: { waitUntil?: (p: Promise<unknown>) => void } }).cfContext;
  const scope: RequestScope = cfContext?.waitUntil
    ? { defer: (task) => cfContext.waitUntil!(task) }
    : { defer: () => {} };
  return runWithRequestScope(scope, () => handle(context, next));
});

const handle = async (context: APIContext, next: MiddlewareNext) => {
  const { pathname } = context.url;

  // `?preview` exposes draft content on public pages; require a session (unauth → strip it).
  if (context.url.searchParams.has("preview")) {
    const previewUser = await getSessionUser(context.request);
    if (!previewUser) {
      const clean = new URL(context.url);
      clean.searchParams.delete("preview");
      return context.redirect(`${clean.pathname}${clean.search}`);
    }
  }

  // Skip auth for public pages and static assets
  const isAdminRoute = pathname.startsWith("/admin");
  const isAdminApiRoute = pathname.startsWith("/api/cms");
  const isLoginPage = pathname === "/admin/login";
  const isLoginApi = pathname === "/api/cms/auth/login";
  const isForgotPasswordPage = pathname === "/admin/forgot-password";
  const isForgotPasswordApi = pathname === "/api/cms/auth/forgot-password";
  const isResetPasswordPage = pathname === "/admin/reset-password";
  const isResetPasswordApi = pathname === "/api/cms/auth/reset-password";
  const isSsoAuthApi = pathname.startsWith("/api/cms/auth/sso/");
  const isSetupPage = pathname === "/admin/setup";
  const isSetupApi = pathname === "/api/cms/auth/setup";
  const isInvitePage = pathname === "/admin/invite";
  const isInviteApi = pathname === "/api/cms/auth/invite";

  // Public despite the /api/cms prefix: cmsImage() puts these URLs on public pages.
  // Only reads files under public/, which are served unauthenticated anyway.
  const isPublicImageApi = pathname.startsWith("/api/cms/img/");

  if ((!isAdminRoute && !isAdminApiRoute) || isPublicImageApi) {
    return next();
  }

  // Security headers for all admin routes
  const isAuthPath =
    pathname.startsWith("/api/cms/auth/") ||
    isLoginPage ||
    isSetupPage ||
    isInvitePage ||
    isForgotPasswordPage ||
    isResetPasswordPage;
  const addSecurityHeaders = (response: Response) => {
    response.headers.set("X-Content-Type-Options", "nosniff");
    response.headers.set("X-Frame-Options", "SAMEORIGIN");
    response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    // Keep credentials and reset/invite tokens out of shared/browser caches.
    if (isAuthPath) response.headers.set("Cache-Control", "no-store");
    return response;
  };

  // The request scope is already established by onRequest (wraps this whole function).
  const serve = async () => addSecurityHeaders(await next());

  // CSRF: positive same-origin assertion on state-changing requests. Machine endpoints
  // authenticate independently (cron bearer, webhook HMAC) or are intentionally public
  // (form submit) and legitimately have no browser Origin, so they're exempt here;
  // everything else (login/setup/invite/reset included) must prove same-origin.
  const method = context.request.method;
  const isMachineEndpoint =
    pathname === "/api/cms/cron/publish" ||
    pathname === "/api/cms/cron/tasks" ||
    pathname.startsWith("/api/cms/webhooks/") ||
    pathname.startsWith("/api/cms/forms/submit/");
  if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS" && !isMachineEndpoint) {
    // Compare against an explicitly configured origin when set (robust behind a proxy that
    // may rewrite Host); otherwise fall back to the request's own origin.
    const host = readEnv("CMS_TRUSTED_ORIGIN") ?? context.url.origin;
    const origin = context.request.headers.get("origin");
    const referer = context.request.headers.get("referer");
    const secFetchSite = context.request.headers.get("sec-fetch-site");

    let refererOk = false;
    if (!origin && referer) {
      try {
        refererOk = new URL(referer).origin === host;
      } catch {
        refererOk = false;
      }
    }
    const originOk = origin === host;
    // Reject an explicit cross-site Fetch-Metadata signal, or the absence of any
    // trustworthy same-origin signal (the hole the old `if (origin && ...)` left open).
    if (secFetchSite === "cross-site" || !(originOk || refererOk)) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  // Check if any users exist (cached after first check)
  if (hasUsers === null || !hasUsers) {
    try {
      const db = await getDb();
      const schema = await import("virtual:kide/schema");
      const tables = schema.cmsTables as Record<string, { main: any }>;
      if (tables.users) {
        const rows = await db.select().from(tables.users.main).limit(1);
        hasUsers = rows.length > 0;
      } else {
        hasUsers = true;
      }
    } catch (error) {
      // Only a missing users table means first run (schema not pushed yet) — anything else
      // (corruption, I/O) must surface, not funnel visitors to /admin/setup.
      const message = error instanceof Error ? error.message : String(error);
      if (!/no such table: cms_users/i.test(message)) throw error;
      hasUsers = false;
    }
  }

  // No users yet — redirect to setup
  if (!hasUsers) {
    if (isSetupPage || isSetupApi) return serve();
    if (isAdminApiRoute) {
      return new Response(JSON.stringify({ error: "Setup required" }), { status: 403 });
    }
    return context.redirect("/admin/setup");
  }

  // After setup, always allow setup API (it self-guards) but redirect setup page to login
  if (isSetupPage) {
    return context.redirect("/admin/login");
  }

  // Always allow login page, login API, and cron/webhook endpoints (they have
  // their own auth: bearer secret for cron, HMAC signature for webhooks)
  const isCronApi = pathname === "/api/cms/cron/publish" || pathname === "/api/cms/cron/tasks";
  const isWebhookApi = pathname.startsWith("/api/cms/webhooks/");
  const isFormSubmit = pathname.startsWith("/api/cms/forms/submit/");
  if (
    isLoginPage ||
    isLoginApi ||
    isForgotPasswordPage ||
    isForgotPasswordApi ||
    isResetPasswordPage ||
    isResetPasswordApi ||
    isSsoAuthApi ||
    isSetupApi ||
    isCronApi ||
    isWebhookApi ||
    isInvitePage ||
    isInviteApi ||
    isFormSubmit
  ) {
    return serve();
  }

  const auth = resolveAdminAuth(config);
  const customProvider = config.admin?.auth?.provider;
  const user =
    auth.provider === "custom" && typeof customProvider === "object"
      ? normalizeCustomUser(await customProvider.getSession(context.request))
      : await getSessionUser(context.request);

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

  return serve();
};
