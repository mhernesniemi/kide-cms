import { readdirSync } from "node:fs";
import { defineConfig } from "drizzle-kit";

function getLocalD1Path() {
  const dir = ".wrangler/state/v3/d1/miniflare-D1DatabaseObject";
  const file = readdirSync(dir).find((f) => f.endsWith(".sqlite") && f !== "*.sqlite");
  if (!file) throw new Error(`No D1 sqlite file found in ${dir}`);
  return `${dir}/${file}`;
}

export default defineConfig({
  schema: "./src/cms/.generated/schema.ts",
  out: "./src/cms/migrations",
  dialect: "sqlite",
  dbCredentials: {
    url: getLocalD1Path(),
  },
});
