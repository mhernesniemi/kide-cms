/**
 * Schema sync for the local SQLite dev database, runnable from scripts/CI.
 *
 * Applies the generated Drizzle schema (`.generated/schema.ts`) for **additive**
 * changes (new tables / new columns) and FTS-safe diffs without a TTY — unlike
 * `drizzle-kit push`, which the dev server shells out to and which needs a
 * terminal. NOTE: a column **rename or drop** is ambiguous and drizzle-kit's
 * resolver still requires a TTY (we surface a clear error below). For those,
 * either DROP the affected table first (data loss — fine for a dev DB you're
 * about to repopulate) and re-run, or hand-write a migration to preserve data.
 *
 *   pnpm cms:push                          # sync ./data/cms.db (or CMS_DATABASE_URL)
 *   pnpm cms:generate && pnpm cms:push     # after editing collections
 *
 * For Cloudflare D1 projects, keep using `drizzle-kit push` / wrangler — this
 * script targets local better-sqlite3 only.
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { pushSQLiteSchema } from "drizzle-kit/api";

import * as schema from "../.generated/schema";

const dbPath = process.env.CMS_DATABASE_URL ?? path.join(process.cwd(), "data", "cms.db");

// The FTS5 search tables are created lazily at runtime (ensureSearchSchema) and
// are not part of the Drizzle schema, so the diff always wants to drop them.
// Mirror drizzle.config's `tablesFilter: ["!cms_search_index*"]` and skip those.
const isSearchIndexStatement = (stmt: string) => /\bcms_search_index/i.test(stmt);

// Tables to drop before pushing, so a column rename/drop becomes a non-interactive
// CREATE (data loss — intended for a dev DB you're repopulating). Accepts a comma
// list of collection slugs or table names; expands to the collection's
// _translations/_versions tables too.
//   RECREATE=pages,posts pnpm cms:push      (or --recreate=pages,posts)
const parseRecreate = (): string[] => {
  const arg = process.argv.find((a) => a.startsWith("--recreate="))?.slice("--recreate=".length);
  const raw = process.env.RECREATE ?? arg ?? "";
  const tables = new Set<string>();
  for (const name of raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)) {
    const base = name.startsWith("cms_") ? name : `cms_${name}`;
    tables.add(base);
    tables.add(`${base}_translations`);
    tables.add(`${base}_versions`);
  }
  return [...tables];
};

async function main() {
  if (dbPath !== ":memory:") mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });

  const sqlite = new Database(dbPath);
  sqlite.pragma("foreign_keys = OFF"); // allow dropping referenced tables for --recreate
  const db = drizzle(sqlite);

  const recreate = parseRecreate();
  if (recreate.length) {
    for (const t of recreate) sqlite.exec(`DROP TABLE IF EXISTS ${t}`);
    console.log(`[cms:push] dropped for recreate: ${recreate.join(", ")}`);
  }

  // pushSQLiteSchema().apply() assumes a libsql driver (calls .all() on DDL), so
  // execute the diff statements directly against better-sqlite3 instead.
  const isTtyPromptError = (error: unknown) => /TTY|Interactive prompts/i.test((error as Error).message);
  let diff;
  try {
    diff = await pushSQLiteSchema({ ...schema }, db as never);
  } catch (error) {
    if (!isTtyPromptError(error)) {
      sqlite.close();
      throw error;
    }
    // The programmatic API has no tablesFilter, so when the schema CREATEs a new
    // table, drizzle-kit sees the runtime-created FTS tables as deletion
    // candidates and wants to ask "renamed?" interactively. Drop them (they're
    // rebuilt lazily; search needs a reindex) and retry before giving up.
    const ftsTables = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'cms_search_index%'")
      .all() as Array<{ name: string }>;
    for (const { name } of ftsTables) sqlite.exec(`DROP TABLE IF EXISTS ${name}`);
    if (ftsTables.length) {
      console.log("[cms:push] Dropped runtime search-index tables to disambiguate the diff —");
      console.log("           run `pnpm cms:reindex` afterwards to rebuild search.");
    }
    try {
      diff = await pushSQLiteSchema({ ...schema }, db as never);
    } catch (retryError) {
      sqlite.close();
      if (isTtyPromptError(retryError)) {
        console.error(
          "[cms:push] This change includes an ambiguous column rename/drop that drizzle-kit\n" +
            "           can only resolve interactively (no TTY here). Either DROP the affected\n" +
            "           table (data loss — fine for a dev DB you're repopulating) and re-run,\n" +
            "           or hand-write a migration to preserve the data.",
        );
        process.exit(1);
      }
      throw retryError;
    }
  }
  const { statementsToExecute, hasDataLoss } = diff;
  const statements = statementsToExecute.filter((stmt) => !isSearchIndexStatement(stmt));

  if (statements.length === 0) {
    console.log("[cms:push] Schema already in sync.");
  } else {
    for (const statement of statements) sqlite.exec(statement);
    console.log(`[cms:push] Applied ${statements.length} statement(s)${hasDataLoss ? " (includes data loss)" : ""}.`);
    if (hasDataLoss)
      console.log("[cms:push] Tip: run `pnpm cms:reindex` to rebuild the search index if columns changed.");
  }

  sqlite.close();
}

await main();
