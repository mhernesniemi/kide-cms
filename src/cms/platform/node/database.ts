import { mkdirSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

let dbInstance: ReturnType<typeof drizzle> | null = null;
let sqliteInstance: InstanceType<typeof Database> | null = null;
let migrationError: (Error & { kideMigrationFailure: true }) | null = null;

// In dev the schema is created by `drizzle-kit push`, so migrate() hits "already exists"
// on tables it didn't record — expected noise. Any other failure means a broken or
// half-applied migration, which must stop startup rather than serve a mismatched schema.
// The SQLite "already exists" text sits on the wrapped driver error (drizzle rethrows via
// `cause`), not on the top-level DrizzleError's own `message` — so the whole chain is checked.
export const isBenignMigrationError = (error: unknown): boolean => {
  if (process.env.NODE_ENV === "development") return true;
  for (let current = error; current; current = (current as { cause?: unknown }).cause) {
    const message = current instanceof Error ? current.message : String(current);
    if (/already exists/i.test(message)) return true;
  }
  return false;
};

/** True for the error getDb throws when a migration failed, so callers can avoid masking it. */
export const isMigrationFailure = (error: unknown): boolean =>
  !!error && typeof error === "object" && (error as { kideMigrationFailure?: boolean }).kideMigrationFailure === true;

const getDbPath = () => {
  const url = process.env.CMS_DATABASE_URL;
  if (url) return url;
  return path.join(process.cwd(), "data", "cms.db");
};

export const getDb = async () => {
  // A failed migration is remembered and re-thrown on every call: once the schema is
  // suspect, no request should get a working handle to it.
  if (migrationError) throw migrationError;
  if (dbInstance) return dbInstance;

  const dbPath = getDbPath();
  mkdirSync(path.dirname(dbPath), { recursive: true });

  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  const db = drizzle(sqlite);

  const migrationsFolder = path.join(process.cwd(), "src/cms/migrations");
  try {
    migrate(db, { migrationsFolder });
  } catch (error) {
    if (!isBenignMigrationError(error)) {
      sqlite.close();
      migrationError = Object.assign(
        new Error(
          `CMS database migration failed; refusing to start against a possibly half-migrated schema. ` +
            `Run \`pnpm db:migrate\` and inspect src/cms/migrations.`,
          { cause: error },
        ),
        { kideMigrationFailure: true as const },
      );
      throw migrationError;
    }
  }

  // Cache only after migration resolves, so a throw never leaves a usable handle behind.
  sqliteInstance = sqlite;
  dbInstance = db;
  return dbInstance;
};

export const closeDb = () => {
  if (sqliteInstance) {
    sqliteInstance.close();
    sqliteInstance = null;
    dbInstance = null;
  }
  migrationError = null;
};
