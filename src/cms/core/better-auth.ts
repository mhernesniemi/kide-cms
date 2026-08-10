import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import type { BetterAuthOptions } from "better-auth";
import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";

import { hashPassword, verifyPassword } from "./auth";
import { account as accountTable } from "./better-auth-schema";
import { betterAuthSchema } from "./better-auth-schema";
import { readEnv } from "./runtime";
import { getDb } from "./runtime";

export const AUTH_BASE_PATH = "/api/cms/auth";

/** Longest password we accept — mirrors core/auth.ts's MAX_PASSWORD_LENGTH. */
const MAX_PASSWORD_LENGTH = 4096;
const SESSION_EXPIRES_IN_SECONDS = 60 * 60 * 24 * 30; // 30 days, matching the legacy sessions

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

export const buildAuthOptions = (db: unknown): BetterAuthOptions => ({
  appName: "Kide CMS",
  basePath: AUTH_BASE_PATH,
  baseURL: resolveBaseURL(),
  secret: resolveSecret(),
  trustedOrigins: resolveTrustedOrigins(),
  database: drizzleAdapter(db as never, {
    provider: "sqlite",
    schema: betterAuthSchema,
  }),
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
  },
});

let authPromise: Promise<ReturnType<typeof betterAuth>> | null = null;

/**
 * Lazily construct the Better Auth engine, memoized for the process.
 *
 * On Node this is a true singleton (one long-lived better-sqlite3 handle). On Cloudflare
 * the D1 binding only exists per request, so `getDb()` there resolves a request-scoped
 * instance — callers on that target must not cache the result across requests.
 */
export const getAuth = async () => {
  if (!authPromise) {
    authPromise = (async () => {
      const db = await getDb();
      return betterAuth(buildAuthOptions(db));
    })();
  }
  return authPromise;
};

/** Reset the memoized engine — for tests and for per-request rebuilds on edge runtimes. */
export const resetAuth = () => {
  authPromise = null;
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
