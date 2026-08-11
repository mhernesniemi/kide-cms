import { drizzle } from "drizzle-orm/d1";

import { disposeCfEnv, getCfEnv } from "./cf-env";

let dbInstance: ReturnType<typeof drizzle> | null = null;

// D1 migrations are applied out of band via `wrangler d1 migrations apply`, so there is
// no boot-time migration here that could fail. Present to satisfy the shared middleware.
export const isMigrationFailure = (_error: unknown): boolean => false;

export const getDb = async () => {
  if (dbInstance) return dbInstance;

  const env = await getCfEnv();
  const db = env.CMS_DB;
  if (!db) {
    throw new Error("D1 database binding CMS_DB not found. Check wrangler.toml.");
  }

  dbInstance = drizzle(db);
  return dbInstance;
};

// Returns a promise on the Cloudflare target — disposing the local platform
// proxy in Node so one-shot scripts can exit. A no-op inside the Worker.
export const closeDb = () => {
  dbInstance = null;
  return disposeCfEnv();
};
