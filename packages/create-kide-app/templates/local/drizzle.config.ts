import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/cms/.generated/schema.ts",
  out: "./src/cms/migrations",
  dialect: "sqlite",
  dbCredentials: {
    url: process.env.CMS_DATABASE_URL ?? "file:./data/cms.db",
  },
});
