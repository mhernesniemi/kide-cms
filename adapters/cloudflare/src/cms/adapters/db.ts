import { drizzle } from "drizzle-orm/d1";

import { disposeCfEnv, getCfEnv } from "./cf-env";

let dbInstance: ReturnType<typeof drizzle> | null = null;

export const getDb = async () => {
  if (dbInstance) return dbInstance;

  const env = await getCfEnv();
  const db = env.CMS_DB as D1Database | undefined;
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
