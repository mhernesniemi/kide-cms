import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { genericOAuth } from "better-auth/plugins/generic-oauth";
import { twoFactor } from "better-auth/plugins/two-factor";
import type { BetterAuthOptions, BetterAuthPlugin } from "better-auth";
import type { GenericOAuthConfig } from "better-auth/plugins/generic-oauth";
import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";

import { hashPassword, verifyPassword } from "./auth";
import type { ResolvedAdminAuthConfig } from "./auth-config";
import { account as accountTable, user as userTable } from "./better-auth-schema";
import { betterAuthSchema } from "./better-auth-schema";
import type { AdminAuthSsoProviderConfig } from "./define";
import { getAuthConfig } from "./runtime";
import { readEnv } from "./runtime";
import { getDb } from "./runtime";

export const AUTH_BASE_PATH = "/api/cms/auth";

/** Longest password we accept — mirrors core/auth.ts's MAX_PASSWORD_LENGTH. */
const MAX_PASSWORD_LENGTH = 4096;
const SESSION_EXPIRES_IN_SECONDS = 60 * 60 * 24 * 30; // 30 days, matching the legacy sessions

/** SSO provider types that map onto Better Auth's generic OAuth2/OIDC plugin. */
const OIDC_PROVIDER_TYPES = new Set(["oidc", "oauth"]);

const usableOidcProviders = (authConfig: ResolvedAdminAuthConfig | null): AdminAuthSsoProviderConfig[] =>
  (authConfig?.ssoProviders ?? []).filter(
    (p) => OIDC_PROVIDER_TYPES.has(p.type) && p.clientId && (p.issuer || p.authorizationUrl),
  );

/** Map one Kide SSO provider onto a Better Auth generic-OAuth provider config. */
const toGenericOAuthConfig = (provider: AdminAuthSsoProviderConfig): GenericOAuthConfig => {
  const allowedDomains = (provider.allowedDomains ?? []).map((d) => d.toLowerCase());
  const discoveryUrl = provider.issuer
    ? `${provider.issuer.replace(/\/$/, "")}/.well-known/openid-configuration`
    : undefined;

  return {
    providerId: provider.id,
    clientId: provider.clientId ?? "",
    clientSecret: provider.clientSecret ?? "",
    discoveryUrl,
    authorizationUrl: provider.authorizationUrl,
    scopes: provider.scopes ?? ["openid", "profile", "email"],
    pkce: true,
    // Provision Kide fields from the verified IdP profile. Enforcing the domain allowlist here
    // (per provider, via closure) rejects the whole sign-in — creation and linking alike.
    mapProfileToUser: (profile: Record<string, unknown>) => {
      const email = String(profile.email ?? "").toLowerCase();
      if (allowedDomains.length > 0) {
        const domain = email.split("@")[1] ?? "";
        if (!allowedDomains.includes(domain)) {
          throw new Error(`Email domain "${domain}" is not permitted for SSO provider "${provider.id}".`);
        }
      }
      return {
        email,
        name: String(profile.name ?? profile.preferred_username ?? email),
        role: provider.role ?? "editor",
      };
    },
    ...(provider.options ?? {}),
  };
};

/** Build the Better Auth plugin list from the resolved admin auth config. */
const buildPlugins = (authConfig: ResolvedAdminAuthConfig | null): BetterAuthPlugin[] => {
  const plugins: BetterAuthPlugin[] = [];

  const oidcProviders = usableOidcProviders(authConfig);
  if (oidcProviders.length > 0) {
    plugins.push(genericOAuth({ config: oidcProviders.map(toGenericOAuthConfig) }));
  }

  if (authConfig?.mfa.totp) {
    plugins.push(
      twoFactor({
        issuer: "Kide CMS",
        totpOptions: { period: 30, digits: 6 },
        backupCodeOptions: { amount: 10 },
      }),
    );
  }

  return plugins;
};

const resolveSecret = (): string => {
  const secret = readEnv("BETTER_AUTH_SECRET");
  if (secret) return secret;
  if (readEnv("NODE_ENV") === "production") {
    throw new Error("BETTER_AUTH_SECRET must be set in production. Generate one with `openssl rand -base64 32`.");
  }
  // Dev/test only: a stable, obviously-insecure fallback so local runs work without setup.
  return "kide-dev-insecure-better-auth-secret-change-me";
};

const resolveTrustedOrigins = (): string[] => {
  const origin = readEnv("CMS_TRUSTED_ORIGIN");
  return origin ? [origin] : [];
};

/**
 * Build the Better Auth options. Kept as a standalone builder so tests can construct an
 * engine against an in-memory database without going through the runtime singleton.
 */
const resolveBaseURL = (): string | undefined =>
  readEnv("BETTER_AUTH_URL") ?? readEnv("CMS_TRUSTED_ORIGIN") ?? undefined;

export const buildAuthOptions = (db: unknown): BetterAuthOptions => {
  const authConfig = getAuthConfig();
  const oidcProviderIds = usableOidcProviders(authConfig).map((p) => p.id);

  return {
    appName: "Kide CMS",
    basePath: AUTH_BASE_PATH,
    baseURL: resolveBaseURL(),
    secret: resolveSecret(),
    trustedOrigins: resolveTrustedOrigins(),
    database: drizzleAdapter(db as never, {
      provider: "sqlite",
      schema: betterAuthSchema,
    }),
    plugins: buildPlugins(authConfig),
    emailAndPassword: {
      enabled: true,
      autoSignIn: true,
      minPasswordLength: 8,
      maxPasswordLength: MAX_PASSWORD_LENGTH,
      // Reuse Kide's Web-Crypto PBKDF2 hasher so existing `pbkdf2:` hashes verify unchanged
      // and every hash stays edge-portable (no node:crypto).
      password: {
        hash: (password) => hashPassword(password),
        verify: ({ hash, password }) => verifyPassword(hash, password),
      },
    },
    session: {
      expiresIn: SESSION_EXPIRES_IN_SECONDS,
    },
    // Link a configured OIDC provider onto a pre-existing Kide user by (verified) email —
    // the configured IdPs are trusted, so an admin who already has a local account keeps it.
    account: {
      accountLinking: {
        enabled: true,
        trustedProviders: oidcProviderIds,
      },
    },
    // Kide does its own durable, DB-backed rate limiting (core/rate-limit.ts) on the auth
    // routes, so Better Auth's in-memory limiter is disabled to keep a single source of truth.
    rateLimit: {
      enabled: false,
    },
    user: {
      modelName: "user",
      additionalFields: {
        // Kide's role, authoritative on the user row (not managed by Better Auth's admin plugin).
        role: { type: "string", required: false, defaultValue: "editor", input: false },
        // Kide's canonical text timestamps. input:false keeps them server-owned; the database
        // hooks below guarantee they're populated so their NOT NULL columns never trip.
        _createdAt: { type: "string", required: false, input: false },
        _updatedAt: { type: "string", required: false, input: false },
      },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (userRow) => {
            const now = new Date().toISOString();
            return { data: { ...userRow, _createdAt: now, _updatedAt: now } };
          },
        },
        update: {
          before: async (userRow) => {
            return { data: { ...userRow, _updatedAt: new Date().toISOString() } };
          },
        },
      },
      session: {
        create: {
          // Step-up gate for OIDC. Better Auth challenges the second factor on credential
          // sign-in (it withholds the session until /two-factor/verify-totp), but NOT on
          // OAuth/OIDC callbacks — those mint a full session directly. To stop an enrolled
          // TOTP from being bypassed via SSO, we refuse to create the OAuth-originated session
          // for a user who has TOTP enabled; returning false aborts it, and the callback
          // bounces to the login page. Such users must sign in with password + TOTP.
          before: async (session, ctx) => {
            const path = (ctx as { path?: string } | null)?.path ?? "";
            const isOAuthCallback = path.startsWith("/oauth2/callback") || path.startsWith("/callback");
            if (!isOAuthCallback) return;
            const rows = await (db as { select: (...args: unknown[]) => any })
              .select({ twoFactorEnabled: userTable.twoFactorEnabled })
              .from(userTable)
              .where(eq(userTable.id, session.userId))
              .limit(1);
            if (rows[0]?.twoFactorEnabled) return false;
            return;
          },
        },
      },
    },
  };
};

let cached: { db: unknown; auth: ReturnType<typeof betterAuth> } | null = null;

/**
 * Construct the Better Auth engine, cached against the current database handle.
 *
 * On Node `getDb()` returns one long-lived better-sqlite3 handle, so this is effectively a
 * process singleton. On Cloudflare the D1 binding only exists per request, so `getDb()`
 * returns a fresh handle each request — the identity check rebuilds the engine for that
 * request instead of reusing a stale, first-request binding. Correct on both targets.
 */
export const getAuth = async () => {
  const db = await getDb();
  if (!cached || cached.db !== db) {
    cached = { db, auth: betterAuth(buildAuthOptions(db)) };
  }
  return cached.auth;
};

/** Reset the cached engine — for tests and to force a rebuild. */
export const resetAuth = () => {
  cached = null;
};

/**
 * Set (or replace) a user's password credential in the Better Auth `cms_accounts` table.
 *
 * Used by the flows that establish a password out-of-band from a normal sign-up — first-admin
 * setup, invite acceptance, and password reset — each of which then mints a session by calling
 * `signInEmail` with the same password. The stored hash uses Kide's pbkdf2 hasher, exactly as
 * Better Auth's own sign-up path would. Replacing (delete-then-insert) makes reset idempotent
 * and guarantees a single credential row per user.
 */
export const setUserCredential = async (userId: string, password: string): Promise<void> => {
  const db = await getDb();
  const hash = await hashPassword(password);
  const now = new Date();
  await db.delete(accountTable).where(and(eq(accountTable.userId, userId), eq(accountTable.providerId, "credential")));
  await db.insert(accountTable).values({
    id: nanoid(),
    userId,
    accountId: userId,
    providerId: "credential",
    password: hash,
    createdAt: now,
    updatedAt: now,
  });
};
