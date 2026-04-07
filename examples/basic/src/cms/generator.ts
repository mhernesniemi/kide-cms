import path from "node:path";
import { generate } from "@kide/core";

import config from "./cms.config";

await generate(config, {
  outputDir: path.join(process.cwd(), "src/cms/.generated"),
  runtimeImportPath: "../runtime",
  configImportPath: "../cms.config",
});
