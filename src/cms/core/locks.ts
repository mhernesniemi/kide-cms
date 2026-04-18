import { and, eq, lte } from "drizzle-orm";
import { nanoid } from "nanoid";

import { getDb } from "./runtime";
import { getSchema } from "./schema";

const LOCK_TTL_MS = 5 * 60 * 1000;

const getLockTable = () => getSchema().cmsLocks as any;
const isExpired = (lockedAt: string) => new Date(lockedAt).getTime() + LOCK_TTL_MS < Date.now();

export const acquireLock = async (
  collection: string,
  documentId: string,
  userId: string,
  userEmail: string,
): Promise<{ acquired: true } | { acquired: false; userEmail: string }> => {
  const db = await getDb();
  const table = getLockTable();

  await db.delete(table).where(lte(table.lockedAt, new Date(Date.now() - LOCK_TTL_MS).toISOString()));

  const rows = await db
    .select()
    .from(table)
    .where(and(eq(table.collection, collection), eq(table.documentId, documentId)));

  const existing = rows[0];
  const now = new Date().toISOString();

  if (existing) {
    if (existing.userId === userId) {
      await db.update(table).set({ lockedAt: now }).where(eq(table._id, existing._id));
      return { acquired: true };
    }
    if (!isExpired(existing.lockedAt)) {
      return { acquired: false, userEmail: existing.userEmail };
    }
    await db.delete(table).where(eq(table._id, existing._id));
  }

  await db.insert(table).values({ _id: nanoid(), collection, documentId, userId, userEmail, lockedAt: now });
  return { acquired: true };
};

export const releaseLock = async (collection: string, documentId: string, userId: string): Promise<void> => {
  const db = await getDb();
  const table = getLockTable();
  await db
    .delete(table)
    .where(and(eq(table.collection, collection), eq(table.documentId, documentId), eq(table.userId, userId)));
};
