import { betterAuth } from "better-auth";
import type { BetterAuthOptions, BetterAuthPlugin } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { getSchema as getBetterAuthSchema } from "better-auth/db";
import { genericOAuth, microsoftEntraId } from "better-auth/plugins/generic-oauth";
import type { GenericOAuthConfig } from "better-auth/plugins/generic-oauth";
import { twoFactor } from "better-auth/plugins/two-factor";
import { passkey } from "@better-auth/passkey";
import { AsyncLocalStorage } from "node:async_hooks";
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { customType, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { nanoid } from "nanoid";

import { hashPassword, verifyPassword, MIN_PASSWORD_LENGTH } from "./auth";
import { enforcedSsoProviders, mfaRequiredFor, resolveAdminAuth } from "./auth-config";
import { auditRequestMeta, logAudit } from "./audit";
import type { AdminAuthSsoProviderConfig, CMSConfig } from "./define";
import { publicOrigin } from "./http";
import { getDb, getEmail, readEnv } from "./runtime";
import { getSchema } from "./schema";

export const ADMIN_AUTH_BASE_PATH = "/api/cms/auth";
export const AUTH_USERS_COLLECTION = "users";

// ---------------------------------------------------------------------------
// Table mapping — shared by the generator (emits the pushed schema) and the
// runtime (builds the adapter view Better Auth reads and writes through).
// ---------------------------------------------------------------------------

type AuthFieldType = "string" | "number" | "boolean" | "date";

export type AuthColumnSpec = {
  /** Better Auth's field name — the key the adapter view uses. */
  field: string;
  /** Key in Kide's generated schema. */
  schemaKey: string;
  column: string;
  type: AuthFieldType;
  required: boolean;
  unique: boolean;
  index: boolean;
  defaultValue?: string | number | boolean;
};

export type AuthTableSpec = {
  model: string;
  table: string;
  exportName: string;
  /** The model is stored in the users collection's own table. */
  isUser: boolean;
  columns: AuthColumnSpec[];
};

const KNOWN_TABLES: Record<string, [table: string, exportName: string]> = {
  session: ["cms_auth_sessions", "cmsAuthSessions"],
  account: ["cms_auth_accounts", "cmsAuthAccounts"],
  verification: ["cms_auth_verifications", "cmsAuthVerifications"],
  twoFactor: ["cms_auth_two_factors", "cmsAuthTwoFactors"],
  passkey: ["cms_auth_passkeys", "cmsAuthPasskeys"],
};

// User columns the users collection already owns (Kide naming).
const USER_OWNED: Record<string, [schemaKey: string, column: string]> = {
  id: ["_id", "_id"],
  name: ["name", "name"],
  email: ["email", "email"],
  createdAt: ["_createdAt", "_created_at"],
  updatedAt: ["_updatedAt", "_updated_at"],
};

const snake = (value: string) => value.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
const pascal = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

const normalizeType = (type: unknown): AuthFieldType =>
  type === "boolean" || type === "number" || type === "date" ? type : "string";

export const authTableSpecs = (options: BetterAuthOptions): AuthTableSpec[] =>
  Object.entries(getBetterAuthSchema(options)).map(([model, definition]) => {
    const isUser = model === "user";
    const [table, exportName] = isUser
      ? [`cms_${AUTH_USERS_COLLECTION}`, `cms${pascal(AUTH_USERS_COLLECTION)}`]
      : (KNOWN_TABLES[model] ?? [`cms_auth_${snake(model)}`, `cmsAuth${pascal(model)}`]);

    const columns: AuthColumnSpec[] = [
      {
        field: "id",
        schemaKey: isUser ? "_id" : "id",
        column: isUser ? "_id" : "id",
        type: "string",
        required: true,
        unique: false,
        index: false,
      },
    ];
    for (const [field, attribute] of Object.entries(definition.fields)) {
      const owned = isUser ? USER_OWNED[field] : undefined;
      const defaultValue = ["string", "number", "boolean"].includes(typeof attribute.defaultValue)
        ? (attribute.defaultValue as string | number | boolean)
        : undefined;
      columns.push({
        field,
        schemaKey: owned?.[0] ?? (isUser ? `_auth${pascal(field)}` : field),
        column: owned?.[1] ?? (isUser ? `_auth_${snake(field)}` : snake(field)),
        type: normalizeType(attribute.type),
        required: attribute.required === true,
        unique: attribute.unique === true,
        index: attribute.index === true || (!!attribute.references && !isUser),
        defaultValue,
      });
    }
    return { model, table, exportName, isUser, columns };
  });

/** Columns Kide adds to the users table on Better Auth's behalf. */
export const authUserExtraColumns = (specs: AuthTableSpec[]) =>
  specs.find((spec) => spec.isUser)?.columns.filter((column) => !(column.field in USER_OWNED)) ?? [];

/** Drizzle source for a column in Kide's pushed schema (dates stay ISO text, like every Kide timestamp). */
export const authColumnSource = (column: AuthColumnSpec, options: { userTable?: boolean } = {}) => {
  let source =
    column.type === "boolean"
      ? `integer("${column.column}", { mode: "boolean" })`
      : column.type === "number"
        ? `integer("${column.column}")`
        : `text("${column.column}")`;
  if (column.field === "id") return `${source}.primaryKey()`;
  // Columns added to an existing users table stay nullable: for a NOT NULL column on a
  // table with rows, drizzle-kit's SQLite push deletes the rows instead of backfilling.
  if (column.required && !options.userTable) source += ".notNull()";
  if (column.unique) source += ".unique()";
  if (column.defaultValue !== undefined) source += `.default(${JSON.stringify(column.defaultValue)})`;
  return source;
};

const isoDate = customType<{ data: Date; driverData: string }>({
  dataType: () => "text",
  toDriver: (value) => (value instanceof Date ? value : new Date(value)).toISOString(),
  fromDriver: (value) => new Date(value),
});

const buildAdapterSchema = (specs: AuthTableSpec[]) =>
  Object.fromEntries(
    specs.map((spec) => {
      const columns = Object.fromEntries(
        spec.columns.map((column) => {
          let builder: any =
            column.type === "boolean"
              ? integer(column.column, { mode: "boolean" })
              : column.type === "number"
                ? integer(column.column)
                : column.type === "date"
                  ? isoDate(column.column)
                  : text(column.column);
          if (column.field === "id") builder = builder.primaryKey();
          else if (column.required) builder = builder.notNull();
          return [column.field, builder];
        }),
      );
      return [spec.model, sqliteTable(spec.table, columns)];
    }),
  );

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

const envKey = (providerId: string, suffix: string) =>
  `KIDE_SSO_${providerId.toUpperCase().replace(/-/g, "_")}_${suffix}`;

const safeEnv = (key: string) => {
  try {
    return readEnv(key);
  } catch {
    return process.env[key];
  }
};

export const ssoCredentials = (provider: AdminAuthSsoProviderConfig) => ({
  clientId: provider.clientId ?? safeEnv(envKey(provider.id, "CLIENT_ID")),
  clientSecret: provider.clientSecret ?? safeEnv(envKey(provider.id, "CLIENT_SECRET")),
});

const PLACEHOLDER_EMAIL = /@[^@]*\.placeholder\.invalid$/;
const looksLikeEmail = (value: unknown): value is string =>
  typeof value === "string" && /^[^@\s]+@[^@\s]+$/.test(value);

/**
 * Normalizes an identity provider profile into the email Kide links on. Emails at the
 * provider's `allowedDomains` count as verified — the provider is authoritative for them.
 */
export const mapSsoProfile = (provider: AdminAuthSsoProviderConfig, profile: Record<string, any>) => {
  let email: string | undefined = looksLikeEmail(profile.email) ? profile.email : undefined;
  if (!email || PLACEHOLDER_EMAIL.test(email)) {
    // Entra puts the sign-in name in preferred_username/upn when the email claim is absent.
    const fallback = [profile.preferred_username, profile.upn].find(looksLikeEmail);
    if (fallback) email = fallback;
  }
  email = email?.toLowerCase();
  const domain = email?.split("@")[1];
  const claimsVerified = profile.email_verified === true || profile.emailVerified === true;

  let domainTrusted = false;
  if (domain && provider.type !== "google") {
    domainTrusted = (provider.allowedDomains ?? []).some((allowed) => allowed.toLowerCase() === domain);
  } else if (domain && provider.type === "google" && provider.hostedDomain) {
    // Google: only a managed Workspace account (hd claim) is authoritative for its domain.
    domainTrusted = profile.hd === provider.hostedDomain && claimsVerified;
  }

  return { ...(email ? { email } : {}), emailVerified: claimsVerified || domainTrusted };
};

const toGenericOAuth = (provider: AdminAuthSsoProviderConfig): GenericOAuthConfig | null => {
  const { clientId, clientSecret } = ssoCredentials(provider);
  if (!clientId) return null;
  // Refresh tokens are what let Kide re-check a user's standing in the background
  // (offline_access; Google uses access_type=offline instead).
  const defaultScopes =
    provider.type === "google" ? ["openid", "email", "profile"] : ["openid", "email", "profile", "offline_access"];
  const common = {
    clientId,
    clientSecret,
    scopes: provider.scopes ?? defaultScopes,
    pkce: true,
    mapProfileToUser: (profile: Record<string, any>) => mapSsoProfile(provider, profile),
  };

  if (provider.type === "microsoft") {
    return {
      ...microsoftEntraId({ clientId, clientSecret: clientSecret ?? "", tenantId: provider.tenantId }),
      ...common,
      providerId: provider.id,
      prompt: "select_account",
    } as GenericOAuthConfig;
  }
  if (provider.type === "google") {
    return {
      ...common,
      providerId: provider.id,
      discoveryUrl: "https://accounts.google.com/.well-known/openid-configuration",
      prompt: "select_account",
      accessType: "offline",
      authorizationUrlParams: provider.hostedDomain ? { hd: provider.hostedDomain } : undefined,
    } as GenericOAuthConfig;
  }
  return {
    ...common,
    providerId: provider.id,
    discoveryUrl: `${provider.issuer.replace(/\/+$/, "")}/.well-known/openid-configuration`,
  } as GenericOAuthConfig;
};

const DEV_SECRET = "kide-development-secret-do-not-use-in-production";
let warnedDevSecret = false;

export const resolveAuthSecret = () => {
  const secret = safeEnv("KIDE_AUTH_SECRET") ?? safeEnv("BETTER_AUTH_SECRET");
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "[kide] KIDE_AUTH_SECRET is not set. Generate one with `openssl rand -base64 32` and add it to the " +
        "deployment environment — it signs admin session cookies.",
    );
  }
  if (!warnedDevSecret) {
    warnedDevSecret = true;
    console.warn("[kide] KIDE_AUTH_SECRET is not set — using a development secret.");
  }
  return DEV_SECRET;
};

type AuthDeps = {
  baseURL?: string;
  secret?: string;
};

/**
 * Better Auth options for the admin audience, derived from `admin.auth`. Pure (no DB)
 * so `cms:generate` can read the table layout from the same function the runtime uses.
 */
export const buildAdminAuthOptions = (config: CMSConfig, deps: AuthDeps = {}): BetterAuthOptions => {
  const auth = resolveAdminAuth(config);
  const baseURL = deps.baseURL ?? "http://localhost:4321";
  const hostname = new URL(baseURL).hostname;
  const ssoById = new Map(auth.ssoProviders.map((provider) => [provider.id, provider]));

  const oauthConfigs = auth.ssoProviders.map(toGenericOAuth).filter((entry): entry is GenericOAuthConfig => !!entry);

  const plugins: BetterAuthPlugin[] = [];
  if (oauthConfigs.length > 0) plugins.push(genericOAuth({ config: oauthConfigs }));
  if (auth.mfa.totp) {
    plugins.push(twoFactor({ issuer: `Kide · ${hostname}`, backupCodeOptions: { amount: 10 } }));
  }
  if (auth.mfa.passkeys) {
    plugins.push(passkey({ rpID: hostname, rpName: "Kide CMS", origin: baseURL }));
  }

  const options: BetterAuthOptions = {
    appName: "Kide CMS",
    baseURL,
    basePath: ADMIN_AUTH_BASE_PATH,
    secret: deps.secret ?? DEV_SECRET,
    telemetry: { enabled: false },
    // Kide rate-limits its own routes against the shared DB-backed limiter.
    rateLimit: { enabled: false },
    emailAndPassword: {
      enabled: auth.password.enabled,
      disableSignUp: true,
      minPasswordLength: MIN_PASSWORD_LENGTH,
      maxPasswordLength: 4096,
      password: { hash: hashPassword, verify: ({ hash, password }) => verifyPassword(hash, password) },
      resetPasswordTokenExpiresIn: 60 * 60,
      revokeSessionsOnPasswordReset: true,
      onPasswordReset: async ({ user }, request) => {
        const kideUser = await loadAuthUser(user.id);
        logAudit({
          action: "auth.password_reset_completed",
          resourceType: "user",
          resourceCollection: AUTH_USERS_COLLECTION,
          resourceId: user.id,
          actor: auditActor(kideUser),
          ...(request ? auditRequestMeta(request) : {}),
        });
      },
      sendResetPassword: async ({ user, token }) => {
        const resetUrl = new URL("/admin/reset-password", baseURL);
        resetUrl.searchParams.set("token", token);
        await getEmail().sendPasswordResetEmail?.(user.email, resetUrl.toString());
      },
    },
    session: {
      expiresIn: auth.sessionDays * 24 * 60 * 60,
      updateAge: 24 * 60 * 60,
    },
    account: {
      accountLinking: { enabled: true, trustedProviders: [], allowDifferentEmails: false },
      // Refresh tokens outlive sessions; keep them unusable to a database reader.
      encryptOAuthTokens: true,
    },
    verification: { storeIdentifier: "hashed" },
    user: {
      changeEmail: { enabled: false },
      deleteUser: { enabled: false },
    },
    advanced: {
      cookiePrefix: "kide",
      database: { generateId: () => nanoid() },
    },
    databaseHooks: {
      user: {
        create: {
          // Kide creates admin users itself (setup, invites, the users collection). The
          // only users Better Auth may create are SSO sign-ins with "jit" provisioning.
          before: async (user, context) => {
            const providerId = (context?.params as { id?: string } | undefined)?.id;
            const provider = providerId ? ssoById.get(providerId) : undefined;
            if (!provider) {
              throw new APIError("FORBIDDEN", { message: "Sign-up is disabled.", code: "SIGNUP_DISABLED" });
            }
            if (provider.provisioning !== "jit") {
              throw new APIError("FORBIDDEN", { message: "No Kide account for this user.", code: "NOT_INVITED" });
            }
            const domain = String(user.email ?? "")
              .split("@")[1]
              ?.toLowerCase();
            if (!domain || !(provider.allowedDomains ?? []).some((allowed) => allowed.toLowerCase() === domain)) {
              throw new APIError("FORBIDDEN", { message: "Email domain not allowed.", code: "DOMAIN_NOT_ALLOWED" });
            }
            return { data: user };
          },
          after: async (user, context) => {
            const providerId = (context?.params as { id?: string } | undefined)?.id;
            const provider = providerId ? ssoById.get(providerId) : undefined;
            await setUserRole(user.id, provider?.role ?? "editor");
          },
        },
      },
    },
    plugins,
  };

  return (config.admin?.auth?.betterAuth?.(options as Record<string, any>) as BetterAuthOptions) ?? options;
};

const KIDE_PLUGIN_IDS = new Set(["generic-oauth", "two-factor", "passkey"]);

export type AuthEndpointRule = { methods: string[]; pattern: RegExp };

const extensionEndpointCache = new WeakMap<CMSConfig, AuthEndpointRule[]>();

/**
 * HTTP endpoints of plugins a project adds through `admin.auth.betterAuth`. Adding a
 * plugin opts its endpoints in; Better Auth's built-ins stay behind Kide's allowlist.
 */
export const extensionAuthEndpoints = (config: CMSConfig): AuthEndpointRule[] => {
  const cached = extensionEndpointCache.get(config);
  if (cached) return cached;
  const rules: AuthEndpointRule[] = [];
  if (config.admin?.auth?.betterAuth) {
    for (const plugin of buildAdminAuthOptions(config).plugins ?? []) {
      if (KIDE_PLUGIN_IDS.has(plugin.id)) continue;
      for (const endpoint of Object.values((plugin.endpoints ?? {}) as Record<string, any>)) {
        if (typeof endpoint?.path !== "string") continue;
        const method = endpoint.options?.method ?? "GET";
        const source = endpoint.path
          .split("/")
          .map((segment: string) =>
            segment.startsWith(":") ? "[^/]+" : segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
          )
          .join("/");
        rules.push({
          methods: (Array.isArray(method) ? method : [method]).map((m: string) => m.toUpperCase()),
          pattern: new RegExp(`^${source}$`),
        });
      }
    }
  }
  extensionEndpointCache.set(config, rules);
  return rules;
};

// ---------------------------------------------------------------------------
// Runtime instance
// ---------------------------------------------------------------------------

/**
 * The instance's plugin set depends on config, so Better Auth's inferred `api` type can't
 * follow it; Kide calls the endpoints it enabled by name.
 */
export type KideAuth = {
  handler: (request: Request) => Promise<Response>;
  api: Record<string, (input?: any) => Promise<any>>;
};

let registeredConfig: CMSConfig | null = null;
const instances = new Map<string, Promise<KideAuth>>();
let legacyMigration: Promise<void> | null = null;

/** Called by createCms and the auth middleware so request-time helpers can find the config. */
export const registerAuthConfig = (config: CMSConfig) => {
  if (registeredConfig !== config) {
    registeredConfig = config;
    instances.clear();
  }
};

export const resetAuthEngine = () => {
  registeredConfig = null;
  instances.clear();
  legacyMigration = null;
};

const requireConfig = () => {
  if (!registeredConfig) throw new Error("[kide] auth config not registered. Call createCms(config) first.");
  return registeredConfig;
};

/** The admin Better Auth instance for a request's public origin (instances are cached per origin). */
export const getAdminAuth = (originOrRequest: string | Request): Promise<KideAuth> => {
  const config = requireConfig();
  const origin = typeof originOrRequest === "string" ? originOrRequest : publicOrigin(originOrRequest);
  const cached = instances.get(origin);
  if (cached) return cached;
  const instance = (async (): Promise<KideAuth> => {
    const db = await getDb();
    legacyMigration ??= migrateLegacyAuth().catch((error) => {
      legacyMigration = null;
      throw error;
    });
    await legacyMigration;
    const options = buildAdminAuthOptions(config, { baseURL: origin, secret: resolveAuthSecret() });
    const auth = betterAuth({
      ...options,
      database: drizzleAdapter(db, { provider: "sqlite", schema: buildAdapterSchema(authTableSpecs(options)) }),
    });
    await captureRefreshErrors(auth);
    return auth as unknown as KideAuth;
  })();
  instance.catch(() => instances.delete(origin));
  instances.set(origin, instance);
  return instance;
};

// Better Auth's /refresh-token reports every failure the same way. Kide needs to tell
// "the provider refused this user" (end their sessions) from "the provider is unreachable"
// (try again later), so it records the provider's own error for the duration of a check.
const refreshErrors = new AsyncLocalStorage<{ error?: unknown }>();

const captureRefreshErrors = async (auth: { $context: Promise<unknown> }) => {
  const context = (await auth.$context) as { socialProviders?: Array<Record<string, any>> };
  for (const provider of context.socialProviders ?? []) {
    const refresh = provider.refreshAccessToken;
    if (typeof refresh !== "function") continue;
    provider.refreshAccessToken = async (...args: unknown[]) => {
      try {
        return await refresh.apply(provider, args);
      } catch (error) {
        const store = refreshErrors.getStore();
        if (store) store.error = error;
        throw error;
      }
    };
  }
};

// ---------------------------------------------------------------------------
// Data helpers (Kide-side writes that bypass Better Auth's HTTP surface)
// ---------------------------------------------------------------------------

const usersTable = () => {
  const tables = getSchema().cmsTables as Record<string, { main: any }>;
  return tables[AUTH_USERS_COLLECTION]?.main ?? null;
};

const authTable = (exportName: string) => (getSchema() as Record<string, any>)[exportName] ?? null;

const setUserRole = async (userId: string, role: string) => {
  const users = usersTable();
  if (!users?.role) return;
  const db = await getDb();
  await db.update(users).set({ role }).where(eq(users._id, userId));
};

/** Create or replace a user's password credential. `passwordHash` comes from hashPassword(). */
export const setCredentialPassword = async (userId: string, passwordHash: string) => {
  const accounts = authTable("cmsAuthAccounts");
  if (!accounts) throw new Error("[kide] cms_auth_accounts is missing — run `pnpm cms:generate && pnpm cms:push`.");
  const db = await getDb();
  const now = new Date().toISOString();
  const updated = await db
    .update(accounts)
    .set({ password: passwordHash, updatedAt: now })
    .where(and(eq(accounts.userId, userId), eq(accounts.providerId, "credential")))
    .returning({ id: accounts.id });
  if (updated.length > 0) return;
  await db.insert(accounts).values({
    id: nanoid(),
    accountId: userId,
    providerId: "credential",
    userId,
    password: passwordHash,
    createdAt: now,
    updatedAt: now,
  });
};

export const hasCredentialPassword = async (userId: string) => {
  const accounts = authTable("cmsAuthAccounts");
  if (!accounts) return false;
  const db = await getDb();
  const rows = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.providerId, "credential")))
    .limit(1);
  return rows.length > 0;
};

export const listSignInMethods = async (userId: string): Promise<string[]> => {
  const accounts = authTable("cmsAuthAccounts");
  if (!accounts) return [];
  const db = await getDb();
  const rows = await db.select({ providerId: accounts.providerId }).from(accounts).where(eq(accounts.userId, userId));
  return rows.map((row: { providerId: string }) => row.providerId);
};

export type AccountSecurity = {
  hasPassword: boolean;
  /** SSO provider ids linked to the account. */
  ssoProviders: string[];
  twoFactorEnabled: boolean;
  passkeys: Array<{ id: string; name: string | null; createdAt: string | null }>;
};

export const getAccountSecurity = async (userId: string): Promise<AccountSecurity> => {
  const db = await getDb();
  const methods = await listSignInMethods(userId);
  const users = usersTable();
  let twoFactorEnabled = false;
  if (users?._authTwoFactorEnabled) {
    const rows = await db
      .select({ enabled: users._authTwoFactorEnabled })
      .from(users)
      .where(eq(users._id, userId))
      .limit(1);
    twoFactorEnabled = rows[0]?.enabled === true;
  }
  const passkeyTable = authTable("cmsAuthPasskeys");
  const passkeys = passkeyTable
    ? await db
        .select({ id: passkeyTable.id, name: passkeyTable.name, createdAt: passkeyTable.createdAt })
        .from(passkeyTable)
        .where(eq(passkeyTable.userId, userId))
    : [];
  return {
    hasPassword: methods.includes("credential"),
    ssoProviders: methods.filter((method) => method !== "credential"),
    twoFactorEnabled,
    passkeys,
  };
};

/** Sign a user out everywhere. */
export const revokeUserSessions = async (userId: string) => {
  const sessions = authTable("cmsAuthSessions");
  if (!sessions) return;
  const db = await getDb();
  await db.delete(sessions).where(eq(sessions.userId, userId));
};

/** Remove everything auth-related for a deleted user. */
export const deleteUserAuthData = async (userId: string) => {
  const db = await getDb();
  for (const exportName of ["cmsAuthSessions", "cmsAuthAccounts", "cmsAuthTwoFactors", "cmsAuthPasskeys"]) {
    const table = authTable(exportName);
    if (table?.userId) await db.delete(table).where(eq(table.userId, userId));
  }
};

/**
 * One-time move of pre-Better-Auth data: `users.password` hashes become credential
 * accounts, and admin-created users are marked email-verified (an admin vouched for
 * the address), so SSO sign-ins can link to them. Idempotent and cheap once done.
 */
export const migrateLegacyAuth = async () => {
  const users = usersTable();
  const accounts = authTable("cmsAuthAccounts");
  if (!users || !accounts || !users._authEmailVerified) return;
  const db = await getDb();

  // Better Auth looks users up by lowercased email; earlier versions stored it as typed.
  // A case-only duplicate keeps its spelling rather than colliding on the unique index.
  try {
    await db.run(sql`
      UPDATE ${users} SET email = lower(email)
      WHERE email != lower(email)
        AND NOT EXISTS (SELECT 1 FROM ${users} other WHERE other.email = lower(${users}.email))
    `);
  } catch (error) {
    // Two case-variants of one address, neither lowercase: leave both for an admin to resolve.
    console.warn("[kide] Could not lowercase all user emails:", error instanceof Error ? error.message : error);
  }

  if (!users.password) return;
  const pending = await db.select({ id: users._id }).from(users).where(isNotNull(users.password)).limit(1);
  if (pending.length === 0) return;

  const now = new Date().toISOString();
  await db.update(users).set({ _authEmailVerified: true }).where(isNotNull(users.password));
  try {
    await db.run(sql`
      INSERT INTO cms_auth_accounts (id, account_id, provider_id, user_id, password, created_at, updated_at)
      SELECT 'legacy-' || u._id, u._id, 'credential', u._id, u.password, ${now}, ${now}
      FROM ${users} u
      WHERE u.password IS NOT NULL AND u.password != ''
        AND NOT EXISTS (
          SELECT 1 FROM cms_auth_accounts a WHERE a.user_id = u._id AND a.provider_id = 'credential'
        )
    `);
  } catch (error) {
    // A concurrent cold start already inserted the same rows (deterministic ids).
    if (!/UNIQUE|PRIMARY KEY/i.test(error instanceof Error ? error.message : String(error))) throw error;
  }
  await db.update(users).set({ password: null }).where(isNotNull(users.password));
};

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  [key: string]: unknown;
};

const parseSessionValue = (value: unknown) => {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed.startsWith("[") && !trimmed.startsWith("{")) return value;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
};

const loadSessionUser = async (userId: string): Promise<{ user: SessionUser; twoFactorEnabled: boolean } | null> => {
  const users = usersTable();
  if (!users) return null;
  const db = await getDb();
  const rows = await db.select().from(users).where(eq(users._id, userId)).limit(1);
  if (rows.length === 0) return null;
  const row = rows[0] as Record<string, unknown>;
  const publicFields = Object.fromEntries(
    Object.entries(row)
      .filter(([key]) => key !== "_id" && key !== "password" && !key.startsWith("_auth"))
      .map(([key, value]) => [key, parseSessionValue(value)]),
  );
  return {
    user: {
      ...publicFields,
      id: String(row._id),
      email: String(row.email),
      name: String(row.name),
      role: String(row.role ?? "editor"),
    },
    twoFactorEnabled: row._authTwoFactorEnabled === true || row._authTwoFactorEnabled === 1,
  };
};

/** A Kide user as the admin sees it (no password, no Better Auth internals). */
export const loadAuthUser = async (userId: string): Promise<SessionUser | null> =>
  (await loadSessionUser(userId))?.user ?? null;

export const auditActor = (user: SessionUser | null) =>
  user ? { id: user.id, email: user.email, role: user.role } : null;

// ---------------------------------------------------------------------------
// SSO standing — offboarding
// ---------------------------------------------------------------------------

export type SsoDenial =
  /** The provider refused the user (disabled, deleted, access revoked): sessions ended. */
  | { kind: "revoked" }
  /** The user must go back through the provider (enforced domain, or nothing to re-check with). */
  | { kind: "reauth"; providerId: string };

const ssoDenials = new WeakMap<Request, SsoDenial>();

/** Why `resolveAdminSession` refused this request's session, when SSO was the reason. */
export const getSsoDenial = (request: Request) => ssoDenials.get(request) ?? null;

const RETRY_AFTER_TRANSIENT_MS = 5 * 60 * 1000;

const isRevocation = (error: unknown) => {
  const body = (error ?? {}) as { status?: number; error?: unknown };
  return (body.status === 400 || body.status === 401) && body.error === "invalid_grant";
};

/** Record that the provider vouched for the user just now (sign-in or a successful re-check). */
export const markSsoVerified = async (userId: string, providerId: string) => {
  const accounts = authTable("cmsAuthAccounts");
  if (!accounts) return;
  const db = await getDb();
  await db
    .update(accounts)
    .set({ updatedAt: new Date().toISOString() })
    .where(and(eq(accounts.userId, userId), eq(accounts.providerId, providerId)));
};

/**
 * Is this SSO user still in good standing with their identity provider? Checked at most
 * every `sso.verifyEveryMinutes` per user, by refreshing the provider's token; one request
 * claims the check so parallel requests don't race the provider's refresh-token rotation.
 */
const checkSsoStanding = async (config: CMSConfig, user: SessionUser, origin: string): Promise<SsoDenial | null> => {
  const resolved = resolveAdminAuth(config);
  if (resolved.ssoProviders.length === 0) return null;
  const accounts = authTable("cmsAuthAccounts");
  if (!accounts) return null;

  const enforcing = enforcedSsoProviders(resolved, user.email).map((provider) => provider.id);
  const db = await getDb();
  const linked: Array<{ id: string; providerId: string; refreshToken: string | null; updatedAt: string }> = await db
    .select({
      id: accounts.id,
      providerId: accounts.providerId,
      refreshToken: accounts.refreshToken,
      updatedAt: accounts.updatedAt,
    })
    .from(accounts)
    .where(
      and(
        eq(accounts.userId, user.id),
        inArray(
          accounts.providerId,
          resolved.ssoProviders.map((provider) => provider.id),
        ),
      ),
    );

  // A domain-bound user must hold a link to one of the providers authoritative for the domain.
  const candidates = enforcing.length ? linked.filter((entry) => enforcing.includes(entry.providerId)) : linked;
  const account = candidates.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  if (!account) return enforcing.length ? { kind: "reauth", providerId: enforcing[0] } : null;

  const intervalMs = resolved.ssoVerifyEveryMinutes * 60 * 1000;
  const lastVerified = Date.parse(account.updatedAt);
  if (Number.isFinite(lastVerified) && Date.now() - lastVerified < intervalMs) return null;

  // Claim the check: push the timestamp forward so concurrent requests skip it. A failed
  // transient check then retries after RETRY_AFTER_TRANSIENT_MS rather than every request.
  const claimed = await db
    .update(accounts)
    .set({ updatedAt: new Date(Date.now() - intervalMs + RETRY_AFTER_TRANSIENT_MS).toISOString() })
    .where(and(eq(accounts.id, account.id), eq(accounts.updatedAt, account.updatedAt)))
    .returning({ id: accounts.id });
  if (claimed.length === 0) return null;

  const provider = resolved.ssoProviders.find((entry) => entry.id === account.providerId)!;
  if (!account.refreshToken) {
    // Nothing to re-check with: the user goes back through the provider.
    await revokeUserSessions(user.id);
    return { kind: "reauth", providerId: provider.id };
  }

  const auth = await getAdminAuth(origin);
  const capture: { error?: unknown } = {};
  try {
    await refreshErrors.run(capture, () => auth.api.refreshToken({ body: { accountId: account.id, userId: user.id } }));
  } catch {
    if (isRevocation(capture.error)) {
      await revokeUserSessions(user.id);
      logAudit({
        action: "auth.sso_access_revoked",
        resourceType: "session",
        resourceCollection: AUTH_USERS_COLLECTION,
        resourceId: user.id,
        actor: auditActor(user),
      });
      return { kind: "revoked" };
    }
    console.warn(
      `[kide] Couldn't re-check ${user.email} with SSO provider "${provider.id}"; retrying in a few minutes.`,
      capture.error ?? "",
    );
    return null;
  }

  await markSsoVerified(user.id, provider.id);
  await applySsoRoleMapping(provider, user.id);
  return null;
};

export type AdminSession = {
  user: SessionUser;
  /** The user must enroll TOTP before using the admin (`mfa.require`). */
  mfaEnrollmentRequired: boolean;
  /** Set-Cookie headers from a session refresh — forward them on the response. */
  setCookies: string[];
};

const hasSessionCookie = (request: Request) =>
  /(?:^|;\s*)(?:__Secure-)?kide\.session_token=/.test(request.headers.get("cookie") ?? "");

export const resolveAdminSession = async (request: Request): Promise<AdminSession | null> => {
  if (!hasSessionCookie(request)) return null;
  const config = requireConfig();
  const auth = await getAdminAuth(request);
  const { headers, response } = await auth.api.getSession({ headers: request.headers, returnHeaders: true });
  if (!response) return null;

  const loaded = await loadSessionUser(response.user.id);
  if (!loaded) return null;

  const denial = await checkSsoStanding(config, loaded.user, publicOrigin(request));
  if (denial) {
    ssoDenials.set(request, denial);
    return null;
  }

  const resolved = resolveAdminAuth(config);
  const mfaEnrollmentRequired =
    mfaRequiredFor(resolved, loaded.user.role) &&
    !loaded.twoFactorEnabled &&
    (await hasCredentialPassword(loaded.user.id));

  return { user: loaded.user, mfaEnrollmentRequired, setCookies: headers?.getSetCookie?.() ?? [] };
};

export const getSessionUser = async (request: Request): Promise<SessionUser | null> =>
  (await resolveAdminSession(request))?.user ?? null;

// ---------------------------------------------------------------------------
// SSO post-processing
// ---------------------------------------------------------------------------

const decodeJwtPayload = (token: string): Record<string, unknown> | null => {
  const payload = token.split(".")[1];
  if (!payload) return null;
  try {
    const base64 = payload
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(payload.length / 4) * 4, "=");
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))));
  } catch {
    return null;
  }
};

/**
 * After a successful SSO callback: apply the provider's `mapRole` to the ID token the
 * callback just stored (Better Auth already verified it).
 */
export const applySsoRoleMapping = async (provider: AdminAuthSsoProviderConfig, userId: string) => {
  if (!provider.mapRole) return;
  const accounts = authTable("cmsAuthAccounts");
  if (!accounts) return;
  const db = await getDb();
  const rows = await db
    .select({ idToken: accounts.idToken })
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.providerId, provider.id)))
    .limit(1);
  const claims = rows[0]?.idToken ? decodeJwtPayload(rows[0].idToken) : null;
  if (!claims) return;
  const role = provider.mapRole(claims);
  if (typeof role !== "string" || !role) return;
  const roleField = requireConfig().collections.find((c) => c.slug === AUTH_USERS_COLLECTION)?.fields.role;
  if (roleField?.type === "select" && !roleField.options.includes(role)) {
    console.warn(`[kide] SSO provider "${provider.id}" mapped a role ("${role}") the users collection doesn't define.`);
    return;
  }
  await setUserRole(userId, role);
};
