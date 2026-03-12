import * as argon2 from "argon2";
import { eq, and } from "drizzle-orm";
import { nanoid } from "nanoid";

import { getDb } from "./db";

export const hashPassword = (plain: string) => argon2.hash(plain);

export const verifyPassword = (hash: string, plain: string) => argon2.verify(hash, plain);

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

export const validateSession = async (
  token: string,
): Promise<{ userId: string; expiresAt: string } | null> => {
  const db = await getDb();
  const schema = await import("../.generated/schema");

  const rows = await db
    .select()
    .from(schema.cmsSessions)
    .where(eq(schema.cmsSessions._id, token))
    .limit(1);

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

  const userRows = await db
    .select()
    .from(tables.users.main)
    .where(eq(tables.users.main._id, session.userId))
    .limit(1);

  if (userRows.length === 0) return null;

  const user = userRows[0] as Record<string, unknown>;
  return {
    id: String(user._id),
    email: String(user.email),
    name: String(user.name),
    role: String(user.role),
  };
};

export const SESSION_COOKIE_NAME = "cms_session";

export const setSessionCookie = (token: string, expiresAt: string) =>
  `${SESSION_COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Expires=${new Date(expiresAt).toUTCString()}`;

export const clearSessionCookie = () =>
  `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
