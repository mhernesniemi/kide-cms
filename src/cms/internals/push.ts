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
 *   pnpm cms:push       # generate + sync ./data/cms.db (or CMS_DATABASE_URL)
 *
 * For Cloudflare D1 projects, keep using `drizzle-kit push` / wrangler — this
 * script targets local better-sqlite3 only.
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { pushSQLiteSchema } from "drizzle-kit/api";

import { loadGeneratedSchema } from "./project";

const schema = await loadGeneratedSchema();

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
// Destructive statements abort unless explicitly approved:
//   pnpm cms:push --allow-data-loss     (or ALLOW_DATA_LOSS=1)
const allowDataLoss = process.argv.includes("--allow-data-loss") || process.env.ALLOW_DATA_LOSS === "1";

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
    // Recreate drops tables before the diff runs, so it needs the same approval as any
    // destructive diff — checked here, before anything is touched.
    if (!allowDataLoss) {
      console.error(`[cms:push] Refusing --recreate (drops ${recreate.join(", ")} — data loss).`);
      console.error("[cms:push] Re-run with --allow-data-loss to apply anyway.");
      sqlite.close();
      process.exit(1);
    }
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

  // drizzle-kit's hasDataLoss misses plain DROP COLUMN — classify statement shapes too.
  // (`__new_` is drizzle's table-recreate pattern: create copy, insert-select, drop old.)
  const isDestructive = (stmt: string) => /\bDROP\s+TABLE\b|\bDROP\s+COLUMN\b|\bDELETE\s+FROM\b|__new_/i.test(stmt);

  // `hasDataLoss` describes the whole diff, including the runtime FTS tables filtered
  // out above — dropping those is not data loss (ensureSearchSchema rebuilds them), so
  // the flag alone would block any additive change made while a search index exists.
  // Judge what we are actually going to run, and only defer to drizzle's flag when
  // something outside the search index could be behind it.
  const droppedSearchIndex = statementsToExecute.some(isSearchIndexStatement);
  const searchIndexIsTheOnlyLoss =
    droppedSearchIndex && statementsToExecute.every((stmt) => isSearchIndexStatement(stmt) || !isDestructive(stmt));
  const losesData = statements.some(isDestructive) || (hasDataLoss && !searchIndexIsTheOnlyLoss);

  if (statements.length === 0) {
    console.log("[cms:push] Schema already in sync.");
  } else if (losesData && !allowDataLoss) {
    console.error("[cms:push] Refusing to apply — this diff loses data:");
    for (const statement of statements) console.error(`  ${statement.split("\n")[0]}`);
    console.error("[cms:push] Re-run with --allow-data-loss to apply anyway.");
    sqlite.close();
    process.exit(1);
  } else {
    // One transaction: a mid-diff failure must not leave a half-applied schema.
    sqlite.exec("BEGIN");
    try {
      for (const statement of statements) sqlite.exec(statement);
      // FKs are OFF in this script, so verify integrity before committing.
      const violations = sqlite.pragma("foreign_key_check") as Array<{ table: string; parent: string }>;
      if (violations.length) {
        const pairs = [...new Set(violations.map((v) => `${v.table}→${v.parent}`))].join(", ");
        throw new Error(`[cms:push] foreign_key_check failed (${pairs}) — rolled back.`);
      }
      sqlite.exec("COMMIT");
    } catch (error) {
      sqlite.exec("ROLLBACK");
      sqlite.close();
      throw error;
    }
    console.log(`[cms:push] Applied ${statements.length} statement(s)${losesData ? " (includes data loss)" : ""}.`);
    if (losesData)
      console.log("[cms:push] Tip: run `pnpm cms:reindex` to rebuild the search index if columns changed.");
  }

  sqlite.close();
}

await main();
