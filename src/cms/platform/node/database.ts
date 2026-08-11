import { mkdirSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";

let dbInstance: ReturnType<typeof drizzle> | null = null;
let sqliteInstance: InstanceType<typeof Database> | null = null;

const getDbPath = () => {
  const url = process.env.CMS_DATABASE_URL;
  if (url) return url;
  return path.join(process.cwd(), "data", "cms.db");
};

// Startup does no schema work. The generated schema (from collections-as-code) is the
// source of truth, and `pnpm cms:push` is the single sync mechanism on the Node target —
// run it in dev and as a deploy step before `pnpm start`. (Cloudflare D1 syncs out of
// band via `wrangler d1 migrations apply`; see platform/cloudflare/database.ts.)
export const getDb = async () => {
  if (dbInstance) return dbInstance;

  const dbPath = getDbPath();
  mkdirSync(path.dirname(dbPath), { recursive: true });

  sqliteInstance = new Database(dbPath);
  sqliteInstance.pragma("journal_mode = WAL");
  sqliteInstance.pragma("foreign_keys = ON");

  dbInstance = drizzle(sqliteInstance);
  return dbInstance;
};

export const closeDb = () => {
  if (sqliteInstance) {
    sqliteInstance.close();
    sqliteInstance = null;
    dbInstance = null;
  }
};
