import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/cms/.generated/schema.ts",
  out: "./src/cms/migrations",
  dialect: "sqlite",
  dbCredentials: {
    url: process.env.CMS_DATABASE_URL ?? "./data/cms.db",
  },
  // FTS5 virtual table + its shadow tables are created lazily at runtime
  // by ensureSearchSchema() in src/cms/core/search.ts. They are not in the
  // Drizzle schema, so exclude them from introspection/push/diff.
  tablesFilter: ["!cms_search_index*"],
});
