import { eq, lt, sql } from "drizzle-orm";

import { getDb } from "./runtime";
import { getSchema } from "./schema";

export type RateLimitResult = { ok: boolean; retryAfterMs: number };
export type RateLimitOptions = {
  max: number;
  windowMs: number;
  /** On a DB error, reject (true) or allow (false). Reject for auth-critical endpoints. */
  failClosed?: boolean;
};

// Bound the stored key: callers pass IPs/emails/token-hashes, so hash+truncate to a fixed
// length rather than storing raw (unbounded) identifiers as primary keys.
const keyId = async (bucket: string, key: string): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${bucket}:${key}`));
  return [...new Uint8Array(digest)]
    .slice(0, 16)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};

/** Read-only: is this key already at/over its limit? Does NOT increment. */
export const peekRateLimit = async (bucket: string, key: string, opts: RateLimitOptions): Promise<RateLimitResult> => {
  const { max, windowMs, failClosed = false } = opts;
  const now = Date.now();
  try {
    const db = await getDb();
    const t = getSchema().cmsRateLimits;
    const rows = await db
      .select()
      .from(t)
      .where(eq(t._id, await keyId(bucket, key)))
      .limit(1);
    const row = rows[0];
    if (!row) return { ok: true, retryAfterMs: 0 };
    const windowStart = Number(row.windowStart);
    if (windowStart + windowMs <= now) return { ok: true, retryAfterMs: 0 }; // window elapsed
    if (Number(row.count) >= max) return { ok: false, retryAfterMs: Math.max(0, windowStart + windowMs - now) };
    return { ok: true, retryAfterMs: 0 };
  } catch {
    return { ok: !failClosed, retryAfterMs: failClosed ? windowMs : 0 };
  }
};

// Shared atomic upsert: one statement both increments and resets an elapsed window, so a
// lapsed window can't leave a stale high count. RETURNING avoids driver result-shape deps.
const bump = async (bucket: string, key: string, windowMs: number, now: number) => {
  const db = await getDb();
  const t = getSchema().cmsRateLimits;
  const expired = sql`${t.windowStart} + ${windowMs} <= ${now}`;
  const rows = await db
    .insert(t)
    .values({ _id: await keyId(bucket, key), windowStart: now, count: 1, expiresAt: now + windowMs })
    .onConflictDoUpdate({
      target: t._id,
      set: {
        windowStart: sql`CASE WHEN ${expired} THEN ${now} ELSE ${t.windowStart} END`,
        count: sql`CASE WHEN ${expired} THEN 1 ELSE ${t.count} + 1 END`,
        expiresAt: sql`CASE WHEN ${expired} THEN ${now + windowMs} ELSE ${t.expiresAt} END`,
      },
    })
    .returning({ count: t.count, windowStart: t.windowStart });
  return { count: Number(rows[0]?.count ?? 1), windowStart: Number(rows[0]?.windowStart ?? now) };
};

/** Increment the counter for one occurrence (e.g. a failed login). Best-effort. */
export const recordRateLimit = async (bucket: string, key: string, opts: RateLimitOptions): Promise<void> => {
  try {
    await bump(bucket, key, opts.windowMs, Date.now());
  } catch {
    // best-effort — a failed limiter write must not break the request path
  }
};

/** Increment-and-check for endpoints where every request counts (forgot/reset/setup/invite). */
export const hitRateLimit = async (bucket: string, key: string, opts: RateLimitOptions): Promise<RateLimitResult> => {
  const { max, windowMs, failClosed = false } = opts;
  const now = Date.now();
  try {
    const { count, windowStart } = await bump(bucket, key, windowMs, now);
    if (count > max) return { ok: false, retryAfterMs: Math.max(0, windowStart + windowMs - now) };
    return { ok: true, retryAfterMs: 0 };
  } catch {
    return { ok: !failClosed, retryAfterMs: failClosed ? windowMs : 0 };
  }
};

/** Reset a key's counter — e.g. an account's failed-login budget after a success. */
export const clearRateLimit = async (bucket: string, key: string): Promise<void> => {
  try {
    const db = await getDb();
    const t = getSchema().cmsRateLimits;
    await db.delete(t).where(eq(t._id, await keyId(bucket, key)));
  } catch {
    // best-effort
  }
};

/** Remove expired windows. Called from the cron tick — no in-process timers on Workers. */
export const pruneRateLimits = async (now = Date.now()): Promise<void> => {
  try {
    const db = await getDb();
    const t = getSchema().cmsRateLimits;
    await db.delete(t).where(lt(t.expiresAt, now));
  } catch {
    // best-effort
  }
};
