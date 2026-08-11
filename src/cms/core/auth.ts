import { and, eq, gt, isNull } from "drizzle-orm";
import { nanoid } from "nanoid";

import { getDb } from "./runtime";
import { getSchema } from "./schema";

// 600k per OWASP. Iteration count is stored per-hash, so existing 100k hashes still verify.
const ITERATIONS = 600_000;
const HASH_LENGTH = 32;
const SALT_LENGTH = 16;

export const MIN_PASSWORD_LENGTH = 12;

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
  const derived = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
      keyMaterial,
      expected.length * 8,
    ),
  );

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

export const createSession = async (userId: string): Promise<{ token: string; expiresAt: string }> => {
  const db = await getDb();
  const schema = getSchema();
  const token = nanoid(32);
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  await db.insert(schema.cmsSessions).values({
    _id: await hashToken(token),
    userId,
    expiresAt,
  });

  return { token, expiresAt };
};

export const validateSession = async (token: string): Promise<{ userId: string; expiresAt: string } | null> => {
  const db = await getDb();
  const schema = getSchema();
  const tokenHash = await hashToken(token);
  const rows = await db.select().from(schema.cmsSessions).where(eq(schema.cmsSessions._id, tokenHash)).limit(1);

  if (rows.length === 0) return null;

  const session = rows[0] as { _id: string; userId: string; expiresAt: string };
  if (new Date(session.expiresAt) < new Date()) {
    await db.delete(schema.cmsSessions).where(eq(schema.cmsSessions._id, tokenHash));
    return null;
  }

  return { userId: session.userId, expiresAt: session.expiresAt };
};

export const destroySession = async (token: string) => {
  const db = await getDb();
  const schema = getSchema();
  await db.delete(schema.cmsSessions).where(eq(schema.cmsSessions._id, await hashToken(token)));
};

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

export const getSessionUser = async (request: Request): Promise<SessionUser | null> => {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const match = cookieHeader.match(/cms_session=([^;]+)/);
  if (!match) return null;

  const session = await validateSession(match[1]);
  if (!session) return null;

  const db = await getDb();
  const schema = getSchema();
  const tables = schema.cmsTables as Record<string, { main: any }>;

  if (!tables.users) return null;

  const userRows = await db.select().from(tables.users.main).where(eq(tables.users.main._id, session.userId)).limit(1);
  if (userRows.length === 0) return null;

  const user = userRows[0] as Record<string, unknown>;
  const publicFields = Object.fromEntries(
    Object.entries(user)
      .filter(([key]) => key !== "_id" && key !== "password")
      .map(([key, value]) => [key, parseSessionValue(value)]),
  );
  return {
    ...publicFields,
    id: String(user._id),
    email: String(user.email),
    name: String(user.name),
    role: String(user.role),
  };
};

const INVITE_EXPIRY_DAYS = 7;
const PASSWORD_RESET_EXPIRY_HOURS = 1;

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

export const createPasswordReset = async (userId: string): Promise<{ token: string; expiresAt: string }> => {
  const db = await getDb();
  const schema = getSchema();
  const token = nanoid(40);
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_EXPIRY_HOURS * 60 * 60 * 1000).toISOString();

  await db.insert(schema.cmsPasswordResets).values({
    _id: nanoid(),
    userId,
    token: await hashToken(token),
    expiresAt,
  });

  return { token, expiresAt };
};

/** Read-only check for rendering the reset page. Does NOT consume — see consumePasswordReset. */
export const validatePasswordReset = async (token: string): Promise<{ userId: string; expiresAt: string } | null> => {
  const db = await getDb();
  const schema = getSchema();
  const rows = await db
    .select()
    .from(schema.cmsPasswordResets)
    .where(eq(schema.cmsPasswordResets.token, await hashToken(token)))
    .limit(1);

  if (rows.length === 0) return null;

  const reset = rows[0] as { userId: string; expiresAt: string; usedAt: string | null };
  if (reset.usedAt) return null;
  if (new Date(reset.expiresAt) < new Date()) return null;

  return { userId: reset.userId, expiresAt: reset.expiresAt };
};

/** Atomically claim a reset token; returns the userId only if it won the race. */
export const consumePasswordReset = async (token: string): Promise<{ userId: string } | null> => {
  const db = await getDb();
  const schema = getSchema();
  const now = new Date().toISOString();
  const rows = await db
    .update(schema.cmsPasswordResets)
    .set({ usedAt: now })
    .where(
      and(
        eq(schema.cmsPasswordResets.token, await hashToken(token)),
        isNull(schema.cmsPasswordResets.usedAt),
        gt(schema.cmsPasswordResets.expiresAt, now),
      ),
    )
    .returning({ userId: schema.cmsPasswordResets.userId });
  return rows.length > 0 ? { userId: rows[0].userId as string } : null;
};

export const SESSION_COOKIE_NAME = "cms_session";

export const setSessionCookie = (token: string, expiresAt: string) => {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Strict${secure}; Expires=${new Date(expiresAt).toUTCString()}`;
};

export const clearSessionCookie = () => `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`;
