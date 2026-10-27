import { mkdirSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";

import { applyMigrations } from "./migrate";

let dbInstance: ReturnType<typeof drizzle> | null = null;
let sqliteInstance: InstanceType<typeof Database> | null = null;

const getDbPath = () => {
  const url = process.env.CMS_DATABASE_URL;
  if (url) return url;
  return path.join(process.cwd(), "data", "cms.db");
};

// By default startup does no schema work: `pnpm cms:push` syncs the schema in dev and as a
// deploy step. With CMS_MIGRATE_ON_BOOT=1 the first connection applies the committed
// migrations instead (the same files D1 applies via `wrangler d1 migrations apply`).
export const getDb = async () => {
  if (dbInstance) return dbInstance;

  const dbPath = getDbPath();
  mkdirSync(path.dirname(dbPath), { recursive: true });

  sqliteInstance = new Database(dbPath);
  sqliteInstance.pragma("journal_mode = WAL");
  sqliteInstance.pragma("foreign_keys = ON");
  if (/^(1|true)$/i.test(process.env.CMS_MIGRATE_ON_BOOT ?? "")) {
    try {
      applyMigrations(sqliteInstance);
    } catch (error) {
      sqliteInstance.close();
      sqliteInstance = null;
      throw error;
    }
  }

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
