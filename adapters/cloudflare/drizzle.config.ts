import { existsSync, readdirSync } from "node:fs";
import { defineConfig } from "drizzle-kit";

// Look for the local D1 sqlite file (created by wrangler after first run).
// Returns null if it doesn't exist yet — `drizzle-kit generate` doesn't need it.
function getLocalD1Path(): string | null {
  const dir = ".wrangler/state/v3/d1/miniflare-D1DatabaseObject";
  if (!existsSync(dir)) return null;
  try {
    const file = readdirSync(dir).find((f) => f.endsWith(".sqlite") && f !== "*.sqlite");
    return file ? `${dir}/${file}` : null;
  } catch {
    return null;
  }
}

export default defineConfig({
  schema: "./src/cms/.generated/schema.ts",
  out: "./src/cms/migrations",
  dialect: "sqlite",
  dbCredentials: {
    url: getLocalD1Path() ?? ":memory:",
  },
  // The FTS5 search index (cms_search_index + its shadow tables) is created
  // lazily at runtime by ensureSearchSchema() in src/cms/core/search.ts. It is
  // not part of the Drizzle schema, and drizzle-kit can't model FTS5 virtual
  // tables — `push` errors with "no such table: cms_search_index_data". Exclude
  // them so the dev integration's auto-push (and manual pushes) stay clean.
  tablesFilter: ["!cms_search_index*"],
});
