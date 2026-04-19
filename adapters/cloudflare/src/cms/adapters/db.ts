import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";

let dbInstance: ReturnType<typeof drizzle> | null = null;
let currentDb: D1Database | null = null;

export const getDb = async () => {
  const db = (env as any).CMS_DB as D1Database | undefined;
  if (!db) {
    throw new Error("D1 database binding CMS_DB not found. Check wrangler.toml.");
  }

  if (dbInstance && currentDb === db) return dbInstance;

  currentDb = db;
  dbInstance = drizzle(db);
  return dbInstance;
};

export const closeDb = () => {
  dbInstance = null;
  currentDb = null;
};
