import type { AstroIntegration } from "astro";
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, watch } from "node:fs";
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

function isCloudflareD1(): boolean {
  const wranglerPath = path.join(process.cwd(), "wrangler.toml");
  if (!existsSync(wranglerPath)) return false;
  try {
    const content = readFileSync(wranglerPath, "utf-8");
    return content.includes("[[d1_databases]]");
  } catch {
    return false;
  }
}

function hasLocalD1Database(): boolean {
  const dir = path.join(process.cwd(), ".wrangler/state/v3/d1/miniflare-D1DatabaseObject");
  try {
    return readdirSync(dir).some((f) => f.endsWith(".sqlite") && f !== "*.sqlite");
  } catch {
    return false;
  }
}

function waitForD1Database(timeoutMs = 10000): Promise<boolean> {
  return new Promise((resolve) => {
    if (hasLocalD1Database()) return resolve(true);
    const interval = 500;
    let waited = 0;
    const timer = setInterval(() => {
      waited += interval;
      if (hasLocalD1Database()) {
        clearInterval(timer);
        resolve(true);
      } else if (waited >= timeoutMs) {
        clearInterval(timer);
        resolve(false);
      }
    }, interval);
  });
}

export default function cmsIntegration(): AstroIntegration {
  let needsDeferredPush = false;

  return {
    name: "kide-cms",
    hooks: {
      "astro:server:start": async ({ address }) => {
        const host = address.family === "IPv6" ? `[${address.address}]` : address.address;
        const base = `http://${host === "[::1]" || host === "127.0.0.1" || host === "[::]" ? "localhost" : host}:${address.port}`;
        console.log(`  \x1b[36m[cms]\x1b[0m Admin panel: \x1b[36m${base}/admin\x1b[0m`);

        if (needsDeferredPush) {
          console.log("  \x1b[36m[cms]\x1b[0m First run — setting up database...");
          // Trigger miniflare to create the D1 database file
          try {
            await fetch(`${base}/admin`);
          } catch {
            // Expected to fail — tables don't exist yet
          }
          const ready = await waitForD1Database(5000);
          if (ready) {
            try {
              pushSchema();
              console.log("  \x1b[36m[cms]\x1b[0m Database ready. Open /admin to create your admin account.");
            } catch (e) {
              console.error("  \x1b[31m[cms]\x1b[0m Database setup failed:", (e as Error).message);
              console.error("  \x1b[31m[cms]\x1b[0m Try running: npx drizzle-kit push --force");
            }
          } else {
            console.error("  \x1b[31m[cms]\x1b[0m D1 database not ready. Restart the dev server to retry.");
          }
          needsDeferredPush = false;
        }
      },
      "astro:config:setup": ({ command }) => {
        console.log("  [cms] Generating schema, types, validators, and API...");
        try {
          runGenerator();
        } catch (e) {
          console.error("  [cms] Generator failed:", (e as Error).message);
        }

        if (command === "dev") {
          const useD1 = isCloudflareD1();

          if (useD1) {
            if (hasLocalD1Database()) {
              // Subsequent run — D1 file exists, push schema now
              try {
                pushSchema();
              } catch (e) {
                console.error("  \x1b[31m[cms]\x1b[0m Database setup failed:", (e as Error).message);
                console.error("  \x1b[31m[cms]\x1b[0m Try running: npx drizzle-kit push --force");
              }
            } else {
              // First run — D1 file doesn't exist yet, defer until server starts
              needsDeferredPush = true;
            }
          } else {
            // Local SQLite
            const dbPath = path.join(process.cwd(), "data", "cms.db");
            const isFirstRun = !existsSync(dbPath);
            if (isFirstRun) {
              console.log("  \x1b[36m[cms]\x1b[0m First run — setting up database...");
            }

            try {
              mkdirSync(path.join(process.cwd(), "data"), {
                recursive: true,
              });
              pushSchema();
              if (isFirstRun) {
                console.log("  \x1b[36m[cms]\x1b[0m Database ready. Open /admin to create your admin account.");
              }
            } catch (e) {
              console.error("  \x1b[31m[cms]\x1b[0m Database setup failed:", (e as Error).message);
              console.error("  \x1b[31m[cms]\x1b[0m Try running: npx drizzle-kit push --force");
            }
          }

          const configPath = path.join(process.cwd(), "src/cms/cms.config.ts");
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
