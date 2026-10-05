import { defineMiddleware } from "astro:middleware";
import type { APIContext, MiddlewareNext } from "astro";
import {
  getSsoDenial,
  publicOrigin,
  registerAuthConfig,
  resolveAdminAuth,
  resolveAdminSession,
  runWithRequestScope,
} from "../core";
import type { RequestScope, SessionUser } from "../core";
import { eq } from "drizzle-orm";

import config from "virtual:kide/config";
import "virtual:kide/runtime";
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
  registerAuthConfig(config);
  // Establish a per-request scope for EVERY request (including public pages and custom public
  // API routes) so deferred work (audit/search/webhook-enqueue) is kept alive only for THIS
  // request — never routed to the module-level script fallback, whose promises aren't attached
  // to any waitUntil on Cloudflare. On Cloudflare defer = cfContext.waitUntil (locals.runtime.ctx
  // throws on Astro 7); on Node it's a no-op (the process stays alive regardless).
  const cfContext = (context.locals as { cfContext?: { waitUntil?: (p: Promise<unknown>) => void } }).cfContext;
  const scope: RequestScope = cfContext?.waitUntil
    ? { defer: (task) => cfContext.waitUntil!(task) }
    : { defer: () => {} };
  return runWithRequestScope(scope, async () => {
    const response = await handle(context, next);
    // Draft responses must never enter the shared cache. Runs after the page
    // rendered because a page-level cache.set() would re-enable caching. The
    // explicit header covers CDNs/proxies that cache HTML on their own terms.
    if (context.url.searchParams.has("preview")) {
      context.cache?.set(false);
      try {
        response.headers.set("Cache-Control", "no-store");
      } catch {
        // Immutable response (e.g. a static asset) — nothing draft-bearing in it.
      }
    }
    return response;
  });
});

const handle = async (context: APIContext, next: MiddlewareNext) => {
  const { pathname } = context.url;

  // `?preview` exposes draft content on public pages; require a session (unauth → strip it).
  if (context.url.searchParams.has("preview")) {
    const previewUser = (await resolveAdminSession(context.request))?.user ?? null;
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
  const isForgotPasswordPage = pathname === "/admin/forgot-password";
  const isResetPasswordPage = pathname === "/admin/reset-password";
  // Every /api/cms/auth/* route guards itself: Kide's own (login, setup, invite, …)
  // and Better Auth's (OAuth callbacks, two-factor, passkeys) through the catch-all.
  const isAuthApi = pathname.startsWith("/api/cms/auth/");
  const isTwoFactorPage = pathname === "/admin/login/verify";
  const isSetupPage = pathname === "/admin/setup";
  const isSetupApi = pathname === "/api/cms/auth/setup";
  const isInvitePage = pathname === "/admin/invite";

  // Public despite the /api/cms prefix: cmsImageUrl() puts these URLs on public pages.
  // Only reads files under public/, which are served unauthenticated anyway.
  const isPublicImageApi = pathname.startsWith("/api/cms/img/");

  if ((!isAdminRoute && !isAdminApiRoute) || isPublicImageApi) {
    return next();
  }

  // Security headers for all admin routes
  const isAuthPath =
    isAuthApi ||
    isTwoFactorPage ||
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
    const host = publicOrigin(context.request);
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
        // Setup is complete once an *admin* exists, not merely a user. Seeded demo
        // editors (or an invite-created editor) would otherwise skip first-run
        // setup and leave the project with no way in. The API guards deleting or
        // demoting the last admin, so "no admin" only ever means "not set up yet".
        const rows = await db.select().from(tables.users.main).where(eq(tables.users.main.role, "admin")).limit(1);
        hasUsers = rows.length > 0;
      } else {
        hasUsers = true;
      }
    } catch (error) {
      // Anything but a missing users table (corruption, I/O) must surface.
      const message = error instanceof Error ? error.message : String(error);
      if (!/no such table: cms_users/i.test(message)) throw error;
      // Schema not pushed. Setup can't succeed against a table-less database
      // (its INSERT would fail too), so say what's actually wrong instead of
      // redirecting there. Typical cause: `pnpm build && pnpm preview` without
      // a prior `pnpm cms:push` (dev pushes on boot, production never does).
      // hasUsers stays unset so the check re-runs once the schema exists.
      return new Response(
        "Database schema is not initialized. Run `pnpm cms:push` against this environment's database (Cloudflare D1: apply your migrations), then reload.",
        { status: 503, headers: { "Content-Type": "text/plain", "Cache-Control": "no-store" } },
      );
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

  // Always allow the sign-in pages, auth API, and cron/webhook endpoints (they have
  // their own auth: bearer secret for cron, HMAC signature for webhooks)
  const isCronApi = pathname === "/api/cms/cron/publish" || pathname === "/api/cms/cron/tasks";
  const isWebhookApi = pathname.startsWith("/api/cms/webhooks/");
  const isFormSubmit = pathname.startsWith("/api/cms/forms/submit/");
  if (
    isLoginPage ||
    isTwoFactorPage ||
    isForgotPasswordPage ||
    isResetPasswordPage ||
    isAuthApi ||
    isSetupApi ||
    isCronApi ||
    isWebhookApi ||
    isInvitePage ||
    isFormSubmit
  ) {
    return serve();
  }

  const auth = resolveAdminAuth(config);
  const customProvider = config.admin?.auth?.provider;
  const session =
    auth.provider === "custom" && typeof customProvider === "object"
      ? null
      : await resolveAdminSession(context.request);
  const user =
    auth.provider === "custom" && typeof customProvider === "object"
      ? normalizeCustomUser(await customProvider.getSession(context.request))
      : (session?.user ?? null);
  // A sliding-session refresh re-issues the cookie; pass it through.
  const withSessionCookies = (response: Response) => {
    for (const cookie of session?.setCookies ?? []) response.headers.append("Set-Cookie", cookie);
    return response;
  };

  // Non-httpOnly hint for the public-site edit bar: lets the injected client skip
  // the session check entirely for anonymous visitors. Carries no auth value — the
  // edit-bar endpoint verifies the real session. Only ever set/cleared on /admin
  // responses, which are never cached, so it can't poison the shared cache.
  const hasEditorHint = (context.request.headers.get("cookie") ?? "").split(/;\s*/).includes("kide-editor=1");
  const editBarEnabled = config.admin?.editBar !== false;
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  const withEditorHint = (response: Response, loggedIn: boolean) => {
    if (loggedIn && editBarEnabled && !hasEditorHint) {
      response.headers.append("Set-Cookie", `kide-editor=1; Path=/; SameSite=Strict${secure}; Max-Age=2592000`);
    } else if (hasEditorHint && (!loggedIn || !editBarEnabled)) {
      response.headers.append("Set-Cookie", `kide-editor=; Path=/; SameSite=Strict${secure}; Max-Age=0`);
    }
    return response;
  };

  if (!user) {
    const denial = getSsoDenial(context.request);
    // API routes → 401
    if (isAdminApiRoute) {
      const error = denial
        ? denial.kind === "revoked"
          ? "sso_access_revoked"
          : "sso_reauthentication_required"
        : null;
      return new Response(JSON.stringify({ error: "Unauthorized", ...(error ? { code: error } : {}) }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
    // The provider refused the user: say so instead of a bare login page.
    if (denial?.kind === "revoked") {
      return withEditorHint(context.redirect("/admin/login?error=sso_access_revoked"), false);
    }
    // Back through the provider — usually a silent hop while its own session is alive.
    if (denial?.kind === "reauth") {
      const returnTo = `${pathname}${context.url.search}`;
      return withEditorHint(
        context.redirect(`/api/cms/auth/sso/${denial.providerId}/start?returnTo=${encodeURIComponent(returnTo)}`),
        false,
      );
    }
    // Admin pages → redirect to login
    return withEditorHint(context.redirect("/admin/login"), false);
  }

  // Attach user to locals for downstream use
  context.locals.user = user;

  // `mfa.require`: password users enroll an authenticator before anything else.
  if (session?.mfaEnrollmentRequired && pathname !== "/admin/account") {
    if (isAdminApiRoute) {
      return Response.json({ error: "Two-factor authentication must be set up first." }, { status: 403 });
    }
    return withSessionCookies(context.redirect("/admin/account?mfa=required"));
  }

  return withSessionCookies(withEditorHint(await serve(), true));
};
