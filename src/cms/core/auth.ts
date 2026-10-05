import { and, eq, gt, isNull } from "drizzle-orm";
import { nanoid } from "nanoid";

import { getDb } from "./runtime";
import { getSchema } from "./schema";

// 600k per OWASP, but Cloudflare Workers rejects counts above 100k in production
// (not in wrangler dev, so only deploys hit it). Iteration count is stored
// per-hash, so hashes created at either count keep verifying on both runtimes.
const isWorkers = typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers";
const ITERATIONS = isWorkers ? 100_000 : 600_000;
const HASH_LENGTH = 32;
const SALT_LENGTH = 16;

export const MIN_PASSWORD_LENGTH = 8;

const encode = (buffer: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buffer)));

const deriveKey = async (plain: string, salt: Uint8Array) => {
  const keyMaterial = await crypto.subtle.importKey("raw", new TextEncoder().encode(plain), "PBKDF2", false, [
    "deriveBits",
  ]);

  return crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: salt.buffer as ArrayBuffer, iterations: ITERATIONS, hash: "SHA-256" },
    keyMaterial,
    HASH_LENGTH * 8,
  );
};

// Upper bounds so a malformed/hostile stored hash or an oversized password can't turn
// hashing/verification into a CPU DoS (a huge iteration count would spin deriveBits
// indefinitely; an unbounded password is wasted work).
const MAX_PASSWORD_LENGTH = 4096;
const MAX_PBKDF2_ITERATIONS = 1_000_000;
const MAX_ENCODED_LENGTH = 512; // generous cap on a base64 salt/digest segment

const safeDecode = (base64: string): Uint8Array<ArrayBuffer> | null => {
  if (base64.length > MAX_ENCODED_LENGTH) return null;
  try {
    const bytes = new Uint8Array(base64.length);
    const binary = atob(base64);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.subarray(0, binary.length) as Uint8Array<ArrayBuffer>;
  } catch {
    return null;
  }
};

export const hashPassword = async (plain: string): Promise<string> => {
  if (plain.length > MAX_PASSWORD_LENGTH) throw new Error("Password exceeds the maximum length.");
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const derived = await deriveKey(plain, salt);
  return `pbkdf2:${ITERATIONS}:${encode(salt.buffer as ArrayBuffer)}:${encode(derived)}`;
};

export const verifyPassword = async (hash: string, plain: string): Promise<boolean> => {
  if (plain.length > MAX_PASSWORD_LENGTH) return false;
  const [scheme, iterStr, saltB64, hashB64] = hash.split(":");
  if (scheme !== "pbkdf2" || !iterStr || !saltB64 || !hashB64) return false;

  const iterations = Number(iterStr);
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > MAX_PBKDF2_ITERATIONS) return false;

  const salt = safeDecode(saltB64);
  const expected = safeDecode(hashB64);
  if (!salt || !expected || expected.length === 0) return false;

  const keyMaterial = await crypto.subtle.importKey("raw", new TextEncoder().encode(plain), "PBKDF2", false, [
    "deriveBits",
  ]);
  let derived: Uint8Array;
  try {
    derived = new Uint8Array(
      await crypto.subtle.deriveBits(
        { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
        keyMaterial,
        expected.length * 8,
      ),
    );
  } catch (error) {
    // Workers rejects iteration counts above 100k — a hash created on Node can
    // land here after a database move. Fail the login instead of crashing.
    console.error("[auth] verifyPassword failed to derive", error);
    return false;
  }

  if (derived.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < derived.length; i++) diff |= derived[i] ^ expected[i];
  return diff === 0;
};

// One-way reference used to store session/invite/reset tokens at rest. The raw token
// lives only in the cookie / email link / invite URL; the DB keeps only SHA-256(token),
// so a database read yields no usable credential. Web Crypto → edge-safe on both targets.
export const hashToken = async (token: string): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  const hex = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `sha256:${hex}`;
};

const INVITE_EXPIRY_DAYS = 7;

export const createInvite = async (userId: string): Promise<{ token: string; expiresAt: string }> => {
  const db = await getDb();
  const schema = getSchema();
  const token = nanoid(32);
  const expiresAt = new Date(Date.now() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString();

  await db.insert(schema.cmsInvites).values({
    _id: nanoid(),
    userId,
    token: await hashToken(token),
    expiresAt,
  });

  return { token, expiresAt };
};

/** Read-only check for rendering the accept page. Does NOT consume — see consumeInvite. */
export const validateInvite = async (token: string): Promise<{ userId: string; expiresAt: string } | null> => {
  const db = await getDb();
  const schema = getSchema();
  const rows = await db
    .select()
    .from(schema.cmsInvites)
    .where(eq(schema.cmsInvites.token, await hashToken(token)))
    .limit(1);

  if (rows.length === 0) return null;

  const invite = rows[0] as { userId: string; expiresAt: string; usedAt: string | null };
  if (invite.usedAt) return null;
  if (new Date(invite.expiresAt) < new Date()) return null;

  return { userId: invite.userId, expiresAt: invite.expiresAt };
};

/**
 * Atomically claim an invite: mark it used and return the userId only if it was still
 * valid, unexpired, and unused. Consume-before-mutate — the `usedAt IS NULL` guard plus
 * RETURNING means concurrent accepts can't both win. Returns null when already used/expired.
 */
export const consumeInvite = async (token: string): Promise<{ userId: string } | null> => {
  const db = await getDb();
  const schema = getSchema();
  const now = new Date().toISOString();
  const rows = await db
    .update(schema.cmsInvites)
    .set({ usedAt: now })
    .where(
      and(
        eq(schema.cmsInvites.token, await hashToken(token)),
        isNull(schema.cmsInvites.usedAt),
        gt(schema.cmsInvites.expiresAt, now),
      ),
    )
    .returning({ userId: schema.cmsInvites.userId });
  return rows.length > 0 ? { userId: rows[0].userId as string } : null;
};

const removed = (name: string, replacement: string) => () => {
  throw new Error(`[kide] ${name}() was removed when admin auth moved to Better Auth. ${replacement}`);
};

/** @deprecated Sessions are issued by Better Auth — sign in through `getAdminAuth(request).api`. */
export const createSession: (userId: string) => Promise<{ token: string; expiresAt: string }> = removed(
  "createSession",
  "Sign users in through getAdminAuth(request).api.",
) as never;
/** @deprecated Use `getSessionUser(request)`. */
export const validateSession: (token: string) => Promise<{ userId: string; expiresAt: string } | null> = removed(
  "validateSession",
  "Use getSessionUser(request).",
) as never;
/** @deprecated Use `getAdminAuth(request).api.signOut`. */
export const destroySession: (token: string) => Promise<void> = removed(
  "destroySession",
  "Use getAdminAuth(request).api.signOut.",
) as never;
/** @deprecated Password resets are Better Auth verification tokens. */
export const createPasswordReset: (userId: string) => Promise<{ token: string; expiresAt: string }> = removed(
  "createPasswordReset",
  "Use getAdminAuth(request).api.requestPasswordReset.",
) as never;
/** @deprecated Password resets are Better Auth verification tokens. */
export const validatePasswordReset: (token: string) => Promise<{ userId: string; expiresAt: string } | null> = removed(
  "validatePasswordReset",
  "Use getAdminAuth(request).api.resetPassword.",
) as never;
/** @deprecated Password resets are Better Auth verification tokens. */
export const consumePasswordReset: (token: string) => Promise<{ userId: string } | null> = removed(
  "consumePasswordReset",
  "Use getAdminAuth(request).api.resetPassword.",
) as never;
/** @deprecated Better Auth names the cookie `kide.session_token`. */
export const SESSION_COOKIE_NAME = "kide.session_token";
/** @deprecated Better Auth sets session cookies. */
export const setSessionCookie: (token: string, expiresAt: string) => string = removed(
  "setSessionCookie",
  "Better Auth sets session cookies.",
) as never;
/** @deprecated Better Auth clears session cookies on sign-out. */
export const clearSessionCookie: () => string = removed(
  "clearSessionCookie",
  "Better Auth clears session cookies on sign-out.",
) as never;
