import type { AstroIntegration } from "astro";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, watch, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { kide } from "./vite-plugin";

// All runtime files resolve relative to this module, never the project root, so
// the integration works identically embedded (workspace package in the project
// tree) and installed from the registry. realpath because pnpm links packages
// via symlinks and Vite/Tailwind watch real paths.
const packageDir = realpathSync(path.dirname(fileURLToPath(import.meta.url)));
const packageRoot = path.dirname(packageDir);
const packagePath = (...segments: string[]) => path.join(packageRoot, ...segments);
const requireFromPackage = createRequire(import.meta.url);

export interface CmsIntegrationOptions {
  /** Path to the CMS config file (default: "src/cms/cms.config") */
  configPath?: string;
  /** Path to the CMS runtime file (default: "src/cms/runtime") */
  runtimePath?: string;
  /** Path to the generated output directory (default: "src/cms/.generated") */
  generatedPath?: string;
  /** Path to the adapters directory (default: "src/cms/adapters") */
  adaptersPath?: string;
  /** Absolute path to the generator script (default: the package's own generator) */
  generatorPath?: string;
  /** Runtime target — selects the platform profile (database/storage). Default "node". */
  platform?: "node" | "cloudflare";
}

// The runner scripts live in this package but read the project from cwd. tsx is
// a dependency of this package, so resolve its entry absolutely — the project
// itself may not depend on it.
const tsxEntry = requireFromPackage.resolve("tsx");

function runScript(cwd: string, scriptPath: string) {
  execFileSync(process.execPath, ["--import", tsxEntry, scriptPath], {
    stdio: "inherit",
    cwd,
  });
}

// D1 dev syncs via drizzle-kit against miniflare's sqlite (located by the CF drizzle
// config); the Node target goes through the guarded cms:push script — same gates as CI/deploy.
function pushSchema(cwd: string, d1 = false) {
  if (d1) {
    execFileSync("npx", ["drizzle-kit", "push", "--force"], { stdio: "inherit", cwd });
  } else {
    runScript(cwd, packagePath("internals", "push.ts"));
  }
}

function isCloudflareD1(cwd: string): boolean {
  const wranglerPath = path.join(cwd, "wrangler.toml");
  if (!existsSync(wranglerPath)) return false;
  try {
    const content = readFileSync(wranglerPath, "utf-8");
    return content.includes("[[d1_databases]]");
  } catch {
    return false;
  }
}

function hasLocalD1Database(cwd: string): boolean {
  const dir = path.join(cwd, ".wrangler/state/v3/d1/miniflare-D1DatabaseObject");
  try {
    return readdirSync(dir).some((file) => file.endsWith(".sqlite") && file !== "*.sqlite");
  } catch {
    return false;
  }
}

function getD1DatabaseName(cwd: string): string | null {
  const wranglerPath = path.join(cwd, "wrangler.toml");
  try {
    const content = readFileSync(wranglerPath, "utf-8");
    const match = content.match(/database_name\s*=\s*"([^"]+)"/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

function initLocalD1(cwd: string) {
  const dbName = getD1DatabaseName(cwd);
  if (!dbName) throw new Error("No database_name found in wrangler.toml");
  execFileSync("npx", ["wrangler", "d1", "execute", dbName, "--local", "--command=SELECT 1"], {
    stdio: "pipe",
    cwd,
  });
}

export default function cmsIntegration(options?: CmsIntegrationOptions): AstroIntegration {
  const configPath = options?.configPath ?? "src/cms/cms.config";
  const runtimePath = options?.runtimePath ?? "src/cms/runtime";
  const generatedPath = options?.generatedPath ?? "src/cms/.generated";
  const adaptersPath = options?.adaptersPath ?? "src/cms/adapters";
  const generatorPath = options?.generatorPath ?? packagePath("internals", "generator.ts");
  // options.platform stays accepted for compat (CF configs pass it) but nothing
  // branches on it anymore — the /uploads route now serves both platforms.

  return {
    name: "kide-cms",
    hooks: {
      "astro:config:setup": ({ command, updateConfig, injectRoute, injectScript, addMiddleware }) => {
        const root = process.cwd();

        updateConfig({
          vite: {
            plugins: kide({
              root,
              configPath,
              runtimePath,
              generatedPath,
              adaptersPath,
              renderers: {
                block: "src/components/BlockRenderer.astro",
                content: "src/components/ContentRenderer.astro",
              },
            }),
          },
        });

        // Admin pages, Kide's API and /uploads (Node: uploads dir, CF: R2) all go through
        // Kide's own router. The preview partial stays an Astro route because it renders
        // the project's Astro components.
        const endpoint = new URL("../routes/astro-endpoint.ts", import.meta.url);
        injectRoute({ pattern: "/admin/[...path]", entrypoint: endpoint });
        injectRoute({ pattern: "/uploads/[...path]", entrypoint: endpoint });
        injectRoute({ pattern: "/api/cms/[...path]", entrypoint: endpoint });
        // A page partial (not an endpoint using the Container API, which doesn't
        // bundle for production) so live preview works in every deployed build.
        injectRoute({
          pattern: "/api/cms/preview/render",
          entrypoint: new URL("../routes/api/preview/render.astro", import.meta.url),
        });

        // Inject auth middleware
        addMiddleware({ entrypoint: new URL("../middleware/auth.ts", import.meta.url), order: "pre" });

        // Inject live-preview client script (no-op unless ?preview is in the URL)
        const previewClient = packagePath("client", "preview.ts");
        injectScript("page", `import ${JSON.stringify(previewClient)};`);

        // Generate schema, types, validators, and API
        console.log("  [cms] Generating schema, types, validators, and API...");
        try {
          runScript(root, generatorPath);
        } catch (error) {
          console.error("  [cms] Generator failed:", (error as Error).message);
        }

        if (command === "dev") {
          const useD1 = isCloudflareD1(root);

          if (useD1) {
            const isFirstRun = !hasLocalD1Database(root);
            if (isFirstRun) {
              console.log("  \x1b[36m[cms]\x1b[0m First run — setting up database...");
              try {
                initLocalD1(root);
              } catch (error) {
                console.error("  \x1b[31m[cms]\x1b[0m Failed to initialize D1:", (error as Error).message);
              }
            }

            try {
              pushSchema(root, true);
              if (isFirstRun) {
                console.log("  \x1b[36m[cms]\x1b[0m Database ready. Open /admin to create your admin account.");
              }
            } catch (error) {
              console.error("  \x1b[31m[cms]\x1b[0m Database setup failed:", (error as Error).message);
              console.error("  \x1b[31m[cms]\x1b[0m Try running: npx drizzle-kit push --force");
            }
          } else {
            const dbPath = path.join(root, "data", "cms.db");
            const isFirstRun = !existsSync(dbPath);
            if (isFirstRun) {
              console.log("  \x1b[36m[cms]\x1b[0m First run — setting up database...");
            }

            try {
              mkdirSync(path.join(root, "data"), { recursive: true });
              pushSchema(root);
              if (isFirstRun) {
                console.log("  \x1b[36m[cms]\x1b[0m Database ready. Open /admin to create your admin account.");
              }
            } catch (error) {
              console.error("  \x1b[31m[cms]\x1b[0m Database setup failed:", (error as Error).message);
              console.error("  \x1b[31m[cms]\x1b[0m Try running: pnpm cms:push");
            }
          }

          const configFilePath = path.join(root, configPath.replace(/\/?$/, ".ts"));
          const collectionsDir = path.join(path.dirname(configFilePath), "collections");
          let debounceTimer: ReturnType<typeof setTimeout> | null = null;
          // macOS fs.watch also fires for sibling writes in the same directory
          // tree — including the generator's own .generated/* output, which
          // would loop regeneration forever. Only act when the content of a
          // watched schema file actually changed.
          const readSchemaFiles = () => {
            const contents = new Map<string, string>();
            const record = (filePath: string) => {
              try {
                contents.set(filePath, readFileSync(filePath, "utf-8"));
              } catch {
                /* deleted or unreadable — absence is the recorded state */
              }
            };
            record(configFilePath);
            let collectionFiles: string[] = [];
            try {
              collectionFiles = readdirSync(collectionsDir);
            } catch {
              /* no collections directory */
            }
            for (const name of collectionFiles) {
              if (name.endsWith(".ts")) record(path.join(collectionsDir, name));
            }
            return contents;
          };
          const sameContents = (a: Map<string, string>, b: Map<string, string>) =>
            a.size === b.size && [...a].every(([key, value]) => b.get(key) === value);
          let lastSchemaContents = readSchemaFiles();

          const onSchemaFileEvent = () => {
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
              const contents = readSchemaFiles();
              if (sameContents(lastSchemaContents, contents)) return;
              lastSchemaContents = contents;
              console.log("  [cms] Schema changed, regenerating...");
              try {
                runScript(root, generatorPath);
                pushSchema(root, useD1);
                console.log("  [cms] Schema updated.");
              } catch (error) {
                console.error("  [cms] Regeneration failed:", (error as Error).message);
              }
            }, 500);
          };

          watch(configFilePath, onSchemaFileEvent);
          try {
            watch(collectionsDir, onSchemaFileEvent);
          } catch {
            /* no collections directory — the config watch still covers registrations */
          }
        }
      },
      "astro:server:start": ({ address }) => {
        const host = address.family === "IPv6" ? `[${address.address}]` : address.address;
        const base = `http://${host === "[::1]" || host === "127.0.0.1" || host === "[::]" ? "localhost" : host}:${address.port}`;
        console.log(`  \x1b[36m[cms]\x1b[0m Admin panel: \x1b[36m${base}/admin\x1b[0m`);
      },
      "astro:build:done": () => {
        const entryPath = path.join(process.cwd(), "dist/server/entry.mjs");
        if (!existsSync(entryPath)) return;

        let content = readFileSync(entryPath, "utf-8");
        content = content.replace(
          /export\s*\{\s*(\w+)\s+as\s+default\s*\}/,
          (_, name) =>
            `const _astroWorker = ${name};\nexport default {\n  fetch: (...args) => _astroWorker.fetch(...args),\n  async scheduled(event, env, ctx) {\n    const headers = env.CRON_SECRET ? { Authorization: "Bearer " + env.CRON_SECRET } : {};\n    for (const path of ["/api/cms/cron/publish", "/api/cms/cron/tasks"]) {\n      const res = await _astroWorker.fetch(new Request("https://dummy" + path, { headers }), env, ctx);\n      if (!res.ok) console.error("Cron " + path + " failed:", res.status, await res.text());\n      else console.log("Cron " + path + ":", await res.text());\n    }\n  }\n};`,
        );
        writeFileSync(entryPath, content);
      },
    },
  };
}
