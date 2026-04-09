import { mkdirSync } from "node:fs";
import path from "node:path";
import { defineConfig } from "drizzle-kit";

const dbPath = path.resolve("./data/cms.db");
mkdirSync(path.dirname(dbPath), { recursive: true });

export default defineConfig({
  schema: "./src/cms/.generated/schema.ts",
  out: "./src/cms/migrations",
  dialect: "sqlite",
  dbCredentials: {
    url: process.env.CMS_DATABASE_URL ?? `file:${dbPath}`,
  },
});
