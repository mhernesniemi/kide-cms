/**
 * Non-interactive schema sync for the local SQLite dev database.
 *
 * Applies the generated Drizzle schema (`.generated/schema.ts`) to the database
 * WITHOUT drizzle-kit's interactive rename/drop prompt, so it is safe to run in
 * scripts and CI (the `drizzle-kit push` the dev server runs needs a TTY and
 * blocks on column renames/drops). Ambiguous changes are treated as drop + add.
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

async function main() {
  if (dbPath !== ":memory:") mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });

  const sqlite = new Database(dbPath);
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite);

  // pushSQLiteSchema().apply() assumes a libsql driver (calls .all() on DDL), so
  // execute the diff statements directly against better-sqlite3 instead.
  const { statementsToExecute, hasDataLoss } = await pushSQLiteSchema({ ...schema }, db as never);
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
