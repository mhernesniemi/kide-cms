// Regenerates the committed test-fixture schema from the fixture config.
// Run after generator changes: pnpm test:fixtures
import { readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { generate } from "../src/cms/core";
import config from "../src/cms/core/__tests__/fixtures/config";

const outputDir = path.join(process.cwd(), "src/cms/core/__tests__/fixtures/project/src/cms/.generated");

await generate(config, {
  outputDir,
  coreImportPath: "@kidecms/core",
  runtimeImportPath: "../runtime",
  configImportPath: "../cms.config",
});

// Tests only consume the Drizzle schema; the other outputs import project
// files that don't exist in the fixture.
for (const file of readdirSync(outputDir)) {
  if (file !== "schema.ts") rmSync(path.join(outputDir, file), { recursive: true, force: true });
}

console.log(`[test-fixtures] wrote ${path.relative(process.cwd(), outputDir)}/schema.ts`);
