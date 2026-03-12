import type { AstroIntegration } from "astro";
import { execSync } from "node:child_process";
import { watch } from "node:fs";
import path from "node:path";

export default function cmsIntegration(): AstroIntegration {
  return {
    name: "astro-cms",
    hooks: {
      "astro:config:setup": ({ command }) => {
        // Run generator before dev or build
        console.log("  [cms] Generating schema, types, validators, and API...");
        try {
          execSync("npx tsx src/cms/core/generator.ts", {
            stdio: "inherit",
            cwd: process.cwd(),
          });
        } catch (e) {
          console.error("  [cms] Generator failed:", (e as Error).message);
        }

        // In dev mode, watch for config changes and re-run generator
        if (command === "dev") {
          const configPath = path.join(process.cwd(), "src/cms/collections.config.ts");
          let debounceTimer: ReturnType<typeof setTimeout> | null = null;

          watch(configPath, () => {
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
              console.log("  [cms] Config changed, regenerating...");
              try {
                execSync("npx tsx src/cms/core/generator.ts", {
                  stdio: "inherit",
                  cwd: process.cwd(),
                });
                console.log("  [cms] Regeneration complete.");
              } catch (e) {
                console.error("  [cms] Regeneration failed:", (e as Error).message);
              }
            }, 500);
          });
        }
      },
    },
  };
}
