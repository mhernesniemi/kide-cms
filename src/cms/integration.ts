import type { AstroIntegration } from "astro";
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, watch, writeFileSync } from "node:fs";
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

function getD1DatabaseName(): string | null {
  const wranglerPath = path.join(process.cwd(), "wrangler.toml");
  try {
    const content = readFileSync(wranglerPath, "utf-8");
    const match = content.match(/database_name\s*=\s*"([^"]+)"/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

function initLocalD1() {
  const dbName = getD1DatabaseName();
  if (!dbName) throw new Error("No database_name found in wrangler.toml");
  execSync(`npx wrangler d1 execute "${dbName}" --local --command="SELECT 1"`, {
    stdio: "pipe",
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
          const useD1 = isCloudflareD1();

          if (useD1) {
            const isFirstRun = !hasLocalD1Database();
            if (isFirstRun) {
              console.log("  \x1b[36m[cms]\x1b[0m First run — setting up database...");
              try {
                initLocalD1();
              } catch (e) {
                console.error("  \x1b[31m[cms]\x1b[0m Failed to initialize D1:", (e as Error).message);
              }
            }

            try {
              pushSchema();
              if (isFirstRun) {
                console.log("  \x1b[36m[cms]\x1b[0m Database ready. Open /admin to create your admin account.");
              }
            } catch (e) {
              console.error("  \x1b[31m[cms]\x1b[0m Database setup failed:", (e as Error).message);
              console.error("  \x1b[31m[cms]\x1b[0m Try running: npx drizzle-kit push --force");
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
      "astro:build:done": () => {
        const entryPath = path.join(process.cwd(), "dist/server/entry.mjs");
        if (!existsSync(entryPath)) return;

        let content = readFileSync(entryPath, "utf-8");
        content = content.replace(
          /export\s*\{\s*(\w+)\s+as\s+default\s*\}/,
          (_, name) =>
            `const _astroWorker = ${name};\nexport default {\n  fetch: (...args) => _astroWorker.fetch(...args),\n  async scheduled(event, env, ctx) {\n    const headers = env.CRON_SECRET ? { Authorization: "Bearer " + env.CRON_SECRET } : {};\n    const res = await _astroWorker.fetch(new Request("https://dummy/api/cms/cron/publish", { headers }), env, ctx);\n    if (!res.ok) console.error("Cron publish failed:", res.status, await res.text());\n    else console.log("Cron publish:", await res.text());\n  }\n};`,
        );
        writeFileSync(entryPath, content);
      },
    },
  };
}
