import { mkdirSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

let dbInstance: ReturnType<typeof drizzle> | null = null;
let sqliteInstance: InstanceType<typeof Database> | null = null;
let migrated = false;

const getDbPath = () => {
  const url = process.env.CMS_DATABASE_URL;
  if (url) return url;
  return path.join(process.cwd(), "data", "cms.db");
};

export const getDb = async () => {
  if (dbInstance) return dbInstance;

  const dbPath = getDbPath();
  mkdirSync(path.dirname(dbPath), { recursive: true });

  sqliteInstance = new Database(dbPath);
  sqliteInstance.pragma("journal_mode = WAL");
  sqliteInstance.pragma("foreign_keys = ON");

  dbInstance = drizzle(sqliteInstance);

  // Auto-run pending migrations on first connection (production only — dev uses drizzle-kit push)
  if (!migrated) {
    const migrationsFolder = path.join(process.cwd(), "src/cms/migrations");
    try {
      migrate(dbInstance, { migrationsFolder });
    } catch {
      // Ignore migration errors — tables may already exist via drizzle-kit push in dev
    }
    migrated = true;
  }

  return dbInstance;
};

export const closeDb = () => {
  if (sqliteInstance) {
    sqliteInstance.close();
    sqliteInstance = null;
    dbInstance = null;
    migrated = false;
  }
};
