import { generate } from "../core";
import { loadProjectConfig, projectPath } from "./project";

const config = await loadProjectConfig();

await generate(config, {
  outputDir: projectPath("src/cms/.generated"),
  coreImportPath: "@kidecms/core",
  runtimeImportPath: "../runtime",
  configImportPath: "../cms.config",
});
