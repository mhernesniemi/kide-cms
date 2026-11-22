/**
 * Applies committed Drizzle migrations to the Node SQLite database (CMS_DATABASE_URL).
 *
 *   kide migrate              # apply pending migrations
 *   kide migrate --baseline   # mark all migrations applied on a cms:push-synced database
 *   kide migrate --check      # exit 1 if the schema has changes without a migration (CI)
 *
 * The server can do the apply step itself with CMS_MIGRATE_ON_BOOT=1.
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

import { applyMigrations, baselineMigrations, getMigrationsDir } from "../platform/node/migrate";
import { pendingMigrationStatements } from "./migrations-check";
import { loadGeneratedSchema } from "./project";

const dir = getMigrationsDir();
const fail = (message: string): never => {
  console.error(`[kide migrate] ${message}`);
  process.exit(1);
};

if (process.argv.includes("--check")) {
  const statements = await pendingMigrationStatements(await loadGeneratedSchema(), dir).catch((error: Error) =>
    fail(error.message),
  );
  if (statements.length) {
    fail(`Schema has changes without a migration. Run \`pnpm db:generate\` and commit:\n  ${statements.join("\n  ")}`);
  }
  console.log("[kide migrate] Migrations match the schema.");
} else {
  const dbPath = process.env.CMS_DATABASE_URL ?? path.join(process.cwd(), "data", "cms.db");
  mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });
  const sqlite = new Database(dbPath);
  try {
    if (process.argv.includes("--baseline")) {
      const count = baselineMigrations(sqlite, dir);
      console.log(`[kide migrate] Baselined ${count} migration(s) on ${dbPath} without running them.`);
    } else {
      applyMigrations(sqlite, dir);
      console.log(`[kide migrate] ${dbPath} is up to date.`);
    }
  } catch (error) {
    fail((error as Error).message);
  } finally {
    sqlite.close();
  }
}
