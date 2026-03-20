import type { AstroIntegration } from "astro";
import { execSync } from "node:child_process";
import { mkdirSync, watch } from "node:fs";
import path from "node:path";

function runGenerator() {
  execSync("npx tsx src/cms/core/generator.ts", {
    stdio: "inherit",
    cwd: process.cwd(),
  });
}

function pushSchema() {
  // Ensure data directory exists before drizzle-kit connects
  mkdirSync(path.join(process.cwd(), "data"), { recursive: true });
  execSync("npx drizzle-kit push --force", {
    stdio: "inherit",
    cwd: process.cwd(),
  });
}

export default function cmsIntegration(): AstroIntegration {
  return {
    name: "kide-cms",
    hooks: {
      "astro:server:start": ({ address }) => {
        const host = address.family === "IPv6" ? `[${address.address}]` : address.address;
        const base = `http://${host === "[::1]" || host === "127.0.0.1" || host === "[::]" ? "localhost" : host}:${address.port}`;
        console.log(`  \x1b[36m[cms]\x1b[0m Admin panel: \x1b[36m${base}/admin\x1b[0m`);
      },
      "astro:config:setup": ({ command }) => {
        console.log("  [cms] Generating schema, types, validators, and API...");
        try {
          runGenerator();
        } catch (e) {
          console.error("  [cms] Generator failed:", (e as Error).message);
        }

        if (command === "dev") {
          // Push schema changes directly to DB in dev (no migration files needed)
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
