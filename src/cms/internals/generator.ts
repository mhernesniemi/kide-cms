import path from "node:path";
import { generate } from "@/cms/core";

import config from "../cms.config";

await generate(config, {
  outputDir: path.join(process.cwd(), "src/cms/.generated"),
  runtimeImportPath: "../internals/runtime",
  configImportPath: "../cms.config",
});
