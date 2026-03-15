import type { AstroIntegration } from "astro";
import { execSync } from "node:child_process";
import { watch } from "node:fs";
import path from "node:path";

function runGenerator() {
  execSync("npx tsx src/cms/core/generator.ts", {
    stdio: "inherit",
    cwd: process.cwd(),
  });
}

function pushSchema() {
  execSync("npx drizzle-kit push --force", {
    stdio: "inherit",
    cwd: process.cwd(),
  });
}

export default function cmsIntegration(): AstroIntegration {
  return {
    name: "astro-cms",
    hooks: {
      "astro:config:setup": ({ command }) => {
        console.log("  [cms] Generating schema, types, validators, and API...");
        try {
          runGenerator();
        } catch (e) {
          console.error("  [cms] Generator failed:", (e as Error).message);
        }

        // In dev mode, push schema directly to DB (no migration files).
        // For production, use `drizzle-kit generate` + `drizzle-kit migrate` manually.
        if (command === "dev") {
          try {
            pushSchema();
          } catch (e) {
            console.error("  [cms] Schema push failed:", (e as Error).message);
          }

          const configPath = path.join(process.cwd(), "src/cms/collections.config.ts");
          let debounceTimer: ReturnType<typeof setTimeout> | null = null;

          // Run scheduled publishing every 60s in dev
          const CRON_INTERVAL = 60_000;
          setInterval(async () => {
            try {
              const { cms } = await import("./.generated/api");
              const result = await (cms as any).scheduled.processPublishing();
              if (result.published > 0 || result.unpublished > 0) {
                console.log(`  [cms] Scheduled: ${result.published} published, ${result.unpublished} unpublished`);
              }
            } catch {
              // Silently ignore — DB may not be ready yet
            }
          }, CRON_INTERVAL);

          watch(configPath, () => {
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
              console.log("  [cms] Config changed, regenerating...");
              try {
                runGenerator();
                pushSchema();
                console.log("  [cms] Schema updated.");
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
