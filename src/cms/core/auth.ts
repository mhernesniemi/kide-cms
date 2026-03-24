import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";

import { getDb } from "./db";

const ITERATIONS = 100_000;
const HASH_LENGTH = 32;
const SALT_LENGTH = 16;

const encode = (buffer: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buffer)));

const decode = (base64: string) => Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));

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

export const hashPassword = async (plain: string): Promise<string> => {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const derived = await deriveKey(plain, salt);
  return `pbkdf2:${ITERATIONS}:${encode(salt.buffer as ArrayBuffer)}:${encode(derived)}`;
};

export const verifyPassword = async (hash: string, plain: string): Promise<boolean> => {
  const [, iterStr, saltB64, hashB64] = hash.split(":");
  if (!iterStr || !saltB64 || !hashB64) return false;
  const salt = decode(saltB64);
  const expected = decode(hashB64);
  const keyMaterial = await crypto.subtle.importKey("raw", new TextEncoder().encode(plain), "PBKDF2", false, [
    "deriveBits",
  ]);
  const derived = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt, iterations: Number(iterStr), hash: "SHA-256" },
      keyMaterial,
      expected.length * 8,
    ),
  );
  if (derived.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < derived.length; i++) diff |= derived[i] ^ expected[i];
  return diff === 0;
};

export const createSession = async (userId: string): Promise<{ token: string; expiresAt: string }> => {
  const db = await getDb();
  const schema = await import("../.generated/schema");
  const token = nanoid(32);
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days

  await db.insert(schema.cmsSessions).values({
    _id: token,
    userId,
    expiresAt,
  });

  return { token, expiresAt };
};

export const validateSession = async (token: string): Promise<{ userId: string; expiresAt: string } | null> => {
  const db = await getDb();
  const schema = await import("../.generated/schema");

  const rows = await db.select().from(schema.cmsSessions).where(eq(schema.cmsSessions._id, token)).limit(1);

  if (rows.length === 0) return null;

  const session = rows[0] as { _id: string; userId: string; expiresAt: string };
  if (new Date(session.expiresAt) < new Date()) {
    // Expired — clean up
    await db.delete(schema.cmsSessions).where(eq(schema.cmsSessions._id, token));
    return null;
  }

  return { userId: session.userId, expiresAt: session.expiresAt };
};

export const destroySession = async (token: string) => {
  const db = await getDb();
  const schema = await import("../.generated/schema");
  await db.delete(schema.cmsSessions).where(eq(schema.cmsSessions._id, token));
};

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: string;
};

export const getSessionUser = async (request: Request): Promise<SessionUser | null> => {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const match = cookieHeader.match(/cms_session=([^;]+)/);
  if (!match) return null;

  const token = match[1];
  const session = await validateSession(token);
  if (!session) return null;

  const db = await getDb();
  const schema = await import("../.generated/schema");
  const tables = schema.cmsTables as Record<string, { main: any }>;

  if (!tables.users) return null;

  const userRows = await db.select().from(tables.users.main).where(eq(tables.users.main._id, session.userId)).limit(1);

  if (userRows.length === 0) return null;

  const user = userRows[0] as Record<string, unknown>;
  return {
    id: String(user._id),
    email: String(user.email),
    name: String(user.name),
    role: String(user.role),
  };
};

// --- Invitations ---

const INVITE_EXPIRY_DAYS = 7;

export const createInvite = async (userId: string): Promise<{ token: string; expiresAt: string }> => {
  const db = await getDb();
  const schema = await import("../.generated/schema");
  const token = nanoid(32);
  const expiresAt = new Date(Date.now() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString();

  await db.insert(schema.cmsInvites).values({
    _id: nanoid(),
    userId,
    token,
    expiresAt,
  });

  return { token, expiresAt };
};

export const validateInvite = async (token: string): Promise<{ userId: string; expiresAt: string } | null> => {
  const db = await getDb();
  const schema = await import("../.generated/schema");

  const rows = await db.select().from(schema.cmsInvites).where(eq(schema.cmsInvites.token, token)).limit(1);
  if (rows.length === 0) return null;

  const invite = rows[0] as { userId: string; expiresAt: string; usedAt: string | null };
  if (invite.usedAt) return null;
  if (new Date(invite.expiresAt) < new Date()) return null;

  return { userId: invite.userId, expiresAt: invite.expiresAt };
};

export const consumeInvite = async (token: string): Promise<void> => {
  const db = await getDb();
  const schema = await import("../.generated/schema");
  await db
    .update(schema.cmsInvites)
    .set({ usedAt: new Date().toISOString() })
    .where(eq(schema.cmsInvites.token, token));
};

export const SESSION_COOKIE_NAME = "cms_session";

export const setSessionCookie = (token: string, expiresAt: string) => {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax${secure}; Expires=${new Date(expiresAt).toUTCString()}`;
};

export const clearSessionCookie = () => `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
