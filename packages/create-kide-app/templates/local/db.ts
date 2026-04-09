import { mkdirSync } from "node:fs";
import path from "node:path";
import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";

let dbInstance: ReturnType<typeof drizzle> | null = null;
let clientInstance: Client | null = null;
let migrated = false;

const getDbUrl = () => {
  const url = process.env.CMS_DATABASE_URL;
  if (url) return url;
  const dbPath = path.join(process.cwd(), "data", "cms.db");
  mkdirSync(path.dirname(dbPath), { recursive: true });
  return `file:${dbPath}`;
};

export const getDb = async () => {
  if (dbInstance) return dbInstance;

  clientInstance = createClient({ url: getDbUrl() });
  dbInstance = drizzle(clientInstance);

  // Auto-run pending migrations on first connection (production only — dev uses drizzle-kit push)
  if (!migrated) {
    const migrationsFolder = path.join(process.cwd(), "src/cms/migrations");
    try {
      await migrate(dbInstance, { migrationsFolder });
    } catch {
      // Ignore migration errors — tables may already exist via drizzle-kit push in dev
    }
    migrated = true;
  }

  return dbInstance;
};

export const closeDb = () => {
  if (clientInstance) {
    clientInstance.close();
    clientInstance = null;
    dbInstance = null;
    migrated = false;
  }
};
