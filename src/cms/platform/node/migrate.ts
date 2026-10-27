import { existsSync } from "node:fs";
import path from "node:path";
import type Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { readMigrationFiles } from "drizzle-orm/migrator";

// The same drizzle-kit output Cloudflare D1 applies with wrangler; Node tracks it in __drizzle_migrations.
export const getMigrationsDir = () =>
  process.env.CMS_MIGRATIONS_DIR
    ? path.resolve(process.env.CMS_MIGRATIONS_DIR)
    : path.join(process.cwd(), "src", "cms", "migrations");

const hasJournal = (dir: string) => existsSync(path.join(dir, "meta", "_journal.json"));

const hasTable = (sqlite: InstanceType<typeof Database>, name: string) =>
  !!sqlite.prepare("select 1 from sqlite_master where type = 'table' and name = ?").get(name);

// Runtime-only (drizzle-orm, no drizzle-kit/tsx), so it can run inside a built server image.
export function applyMigrations(sqlite: InstanceType<typeof Database>, dir = getMigrationsDir()): void {
  if (!hasJournal(dir)) {
    throw new Error(`No migrations at ${dir}. Generate them with \`pnpm db:generate\` and commit the folder.`);
  }
  if (!hasTable(sqlite, "__drizzle_migrations") && hasTable(sqlite, "cms_users")) {
    throw new Error(
      "Database was synced with cms:push and tracks no migrations. Once it matches the latest migration, " +
        "run `kide migrate --baseline` once to mark them applied.",
    );
  }
  // Table rebuilds (drop + recreate) must not cascade; the PRAGMA is a no-op inside the migrator's transaction.
  const foreignKeys = sqlite.pragma("foreign_keys", { simple: true });
  sqlite.pragma("foreign_keys = OFF");
  try {
    migrate(drizzle(sqlite), { migrationsFolder: dir });
  } finally {
    sqlite.pragma(`foreign_keys = ${foreignKeys ? "ON" : "OFF"}`);
  }
}

// For a database that predates migrations (synced with cms:push): records every migration as
// applied without running it. Only correct when the database already matches the latest one.
export function baselineMigrations(sqlite: InstanceType<typeof Database>, dir = getMigrationsDir()): number {
  if (!hasJournal(dir)) throw new Error(`No migrations at ${dir}.`);
  if (hasTable(sqlite, "__drizzle_migrations")) {
    const row = sqlite.prepare("select count(*) as n from __drizzle_migrations").get() as { n: number };
    if (row.n > 0) throw new Error("Database already tracks migrations; nothing to baseline.");
  }
  sqlite.exec(
    `CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at numeric)`,
  );
  const insert = sqlite.prepare(`INSERT INTO "__drizzle_migrations" ("hash", "created_at") VALUES (?, ?)`);
  const migrations = readMigrationFiles({ migrationsFolder: dir });
  sqlite.transaction(() => {
    for (const m of migrations) insert.run(m.hash, m.folderMillis);
  })();
  return migrations.length;
}
