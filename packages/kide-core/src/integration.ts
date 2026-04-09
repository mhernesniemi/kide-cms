import type { AstroIntegration } from "astro";
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, watch, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface CmsIntegrationOptions {
  /** Path to the CMS config file (default: "src/cms/cms.config") */
  configPath?: string;
  /** Path to the CMS runtime file (default: "src/cms/runtime") */
  runtimePath?: string;
  /** Path to the generated output directory (default: "src/cms/.generated") */
  generatedPath?: string;
  /** Path to the adapters directory (default: "src/cms/adapters") */
  adaptersPath?: string;
  /** Path to the generator script (default: "src/cms/generator.ts") */
  generatorPath?: string;
}

function runGenerator(cwd: string, generatorPath: string) {
  execSync(`node --import tsx ${generatorPath}`, {
    stdio: "inherit",
    cwd,
  });
}

function pushSchema(cwd: string) {
  execSync("npx drizzle-kit push --force", {
    stdio: "inherit",
    cwd,
  });
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
  execSync(`npx wrangler d1 execute "${dbName}" --local --command="SELECT 1"`, {
    stdio: "pipe",
    cwd,
  });
}

export default function cmsIntegration(options?: CmsIntegrationOptions): AstroIntegration {
  const configPath = options?.configPath ?? "src/cms/cms.config";
  const runtimePath = options?.runtimePath ?? "src/cms/internals/runtime";
  const generatedPath = options?.generatedPath ?? "src/cms/.generated";
  const adaptersPath = options?.adaptersPath ?? "src/cms/adapters";
  const generatorPath = options?.generatorPath ?? "src/cms/internals/generator.ts";

  return {
    name: "kide-cms",
    hooks: {
      "astro:config:setup": ({ command, updateConfig, injectRoute, addMiddleware }) => {
        const root = process.cwd();

        // Generate a wrapper CSS that adds @source directives and imports user's admin CSS
        const corePkgDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
        const adminDir = path.join(corePkgDir, "admin");
        const routesDir = path.join(corePkgDir, "routes");
        // Find tw-animate-css — pnpm may hoist it anywhere in the dep tree
        const findTwAnimate = () => {
          const candidates = [
            path.join(corePkgDir, "node_modules", "tw-animate-css", "dist", "tw-animate.css"),
            path.join(root, "node_modules", "tw-animate-css", "dist", "tw-animate.css"),
          ];
          // Walk up from corePkgDir
          let dir = corePkgDir;
          while (dir !== path.dirname(dir)) {
            candidates.push(path.join(dir, "node_modules", "tw-animate-css", "dist", "tw-animate.css"));
            dir = path.dirname(dir);
          }
          for (const candidate of candidates) {
            if (existsSync(candidate)) return candidate;
          }
          return candidates[0];
        };
        const twAnimateCssPath = findTwAnimate();
        const userAdminCss = path.resolve(root, "src/styles/admin.css");
        const generatedDir = path.join(root, "node_modules", ".kide");
        mkdirSync(generatedDir, { recursive: true });
        const wrapperCss = path.join(generatedDir, "admin.css");
        writeFileSync(
          wrapperCss,
          [
            `@source "${adminDir}";`,
            `@source "${routesDir}";`,
            `@import "${twAnimateCssPath}";`,
            `@import "${userAdminCss}";`,
            "",
            "/* shadcn component styles (accordion, state variants) */",
            "@theme inline {",
            "  @keyframes accordion-down { from { height: 0 } to { height: var(--radix-accordion-content-height, var(--accordion-panel-height, auto)) } }",
            "  @keyframes accordion-up { from { height: var(--radix-accordion-content-height, var(--accordion-panel-height, auto)) } to { height: 0 } }",
            "}",
            '@custom-variant data-open { &:where([data-state="open"]), &:where([data-open]:not([data-open="false"])) { @slot; } }',
            '@custom-variant data-closed { &:where([data-state="closed"]), &:where([data-closed]:not([data-closed="false"])) { @slot; } }',
            '@custom-variant data-checked { &:where([data-state="checked"]), &:where([data-checked]:not([data-checked="false"])) { @slot; } }',
            '@custom-variant data-unchecked { &:where([data-state="unchecked"]), &:where([data-unchecked]:not([data-unchecked="false"])) { @slot; } }',
            '@custom-variant data-selected { &:where([data-selected="true"]) { @slot; } }',
            '@custom-variant data-disabled { &:where([data-disabled="true"]), &:where([data-disabled]:not([data-disabled="false"])) { @slot; } }',
            '@custom-variant data-active { &:where([data-state="active"]), &:where([data-active]:not([data-active="false"])) { @slot; } }',
            '@custom-variant data-horizontal { &:where([data-orientation="horizontal"]) { @slot; } }',
            '@custom-variant data-vertical { &:where([data-orientation="vertical"]) { @slot; } }',
            "@utility no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; &::-webkit-scrollbar { display: none; } }",
            "",
          ].join("\n"),
        );

        // Generate custom field components barrel
        const customFieldsDir = path.resolve(root, "src/cms/admin/fields");
        const customFieldsBarrel = path.join(generatedDir, "custom-fields.ts");
        const generateFieldsBarrel = () => {
          if (existsSync(customFieldsDir)) {
            const files = readdirSync(customFieldsDir).filter((f) => f.endsWith(".tsx"));
            const imports = files.map((f) => {
              const name = f.replace(".tsx", "");
              return `  "${name}": (await import("${path.join(customFieldsDir, f)}")).default,`;
            });
            writeFileSync(
              customFieldsBarrel,
              `export const customFields: Record<string, any> = {\n${imports.join("\n")}\n};\n`,
            );
          } else {
            writeFileSync(customFieldsBarrel, "export const customFields: Record<string, any> = {};\n");
          }
        };
        generateFieldsBarrel();

        // Virtual module aliases — resolve route imports to the user's app files
        updateConfig({
          vite: {
            resolve: {
              alias: {
                "virtual:kide/config": path.resolve(root, configPath),
                "virtual:kide/api": path.resolve(root, generatedPath, "api"),
                "virtual:kide/schema": path.resolve(root, generatedPath, "schema"),
                "virtual:kide/runtime": path.resolve(root, runtimePath),
                "virtual:kide/db": path.resolve(root, adaptersPath, "db"),
                "virtual:kide/email": path.resolve(root, adaptersPath, "email"),
                "virtual:kide/block-renderer": path.resolve(root, "src/components/BlockRenderer.astro"),
                "virtual:kide/admin-css": wrapperCss,
                "virtual:kide/custom-fields": customFieldsBarrel,
              },
            },
          },
        });

        // Inject admin pages
        injectRoute({ pattern: "/admin/login", entrypoint: "@kidecms/core/routes/pages/admin/login.astro" });
        injectRoute({ pattern: "/admin/setup", entrypoint: "@kidecms/core/routes/pages/admin/setup.astro" });
        injectRoute({ pattern: "/admin/invite", entrypoint: "@kidecms/core/routes/pages/admin/invite.astro" });
        injectRoute({ pattern: "/admin/assets", entrypoint: "@kidecms/core/routes/pages/admin/assets/index.astro" });
        injectRoute({ pattern: "/admin/assets/[id]", entrypoint: "@kidecms/core/routes/pages/admin/assets/[id].astro" });
        injectRoute({ pattern: "/admin/[...path]", entrypoint: "@kidecms/core/routes/pages/admin/[...path].astro" });

        // Inject API routes
        injectRoute({ pattern: "/api/cms/auth/login", entrypoint: "@kidecms/core/routes/api/cms/auth/login.ts" });
        injectRoute({ pattern: "/api/cms/auth/logout", entrypoint: "@kidecms/core/routes/api/cms/auth/logout.ts" });
        injectRoute({ pattern: "/api/cms/auth/setup", entrypoint: "@kidecms/core/routes/api/cms/auth/setup.ts" });
        injectRoute({ pattern: "/api/cms/auth/invite", entrypoint: "@kidecms/core/routes/api/cms/auth/invite.ts" });
        injectRoute({ pattern: "/api/cms/assets/upload", entrypoint: "@kidecms/core/routes/api/cms/assets/upload.ts" });
        injectRoute({ pattern: "/api/cms/assets/folders", entrypoint: "@kidecms/core/routes/api/cms/assets/folders.ts" });
        injectRoute({ pattern: "/api/cms/assets/[id]", entrypoint: "@kidecms/core/routes/api/cms/assets/[id].ts" });
        injectRoute({ pattern: "/api/cms/assets", entrypoint: "@kidecms/core/routes/api/cms/assets/index.ts" });
        injectRoute({ pattern: "/api/cms/ai/alt-text", entrypoint: "@kidecms/core/routes/api/cms/ai/alt-text.ts" });
        injectRoute({ pattern: "/api/cms/ai/seo", entrypoint: "@kidecms/core/routes/api/cms/ai/seo.ts" });
        injectRoute({ pattern: "/api/cms/ai/translate", entrypoint: "@kidecms/core/routes/api/cms/ai/translate.ts" });
        injectRoute({ pattern: "/api/cms/cron/publish", entrypoint: "@kidecms/core/routes/api/cms/cron/publish.ts" });
        injectRoute({
          pattern: "/api/cms/locks/[...path]",
          entrypoint: "@kidecms/core/routes/api/cms/locks/[...path].ts",
        });
        // Preview render route uses Astro Container API which depends on Vite internals.
        // Only inject in dev mode — production builds (especially Cloudflare Workers) can't bundle it.
        if (command === "dev") {
          injectRoute({ pattern: "/api/cms/preview/render", entrypoint: "@kidecms/core/routes/api/cms/preview/render.ts" });
        }
        injectRoute({
          pattern: "/api/cms/references/[collection]/[id]",
          entrypoint: "@kidecms/core/routes/api/cms/references/[collection]/[id].ts",
        });
        injectRoute({ pattern: "/api/cms/img/[...path]", entrypoint: "@kidecms/core/routes/api/cms/img/[...path].ts" });
        injectRoute({
          pattern: "/api/cms/[collection]/[...path]",
          entrypoint: "@kidecms/core/routes/api/cms/[collection]/[...path].ts",
        });

        // Inject auth middleware
        addMiddleware({ entrypoint: "@kidecms/core/middleware/auth.ts", order: "pre" });

        // Generate schema, types, validators, and API
        console.log("  [cms] Generating schema, types, validators, and API...");
        try {
          runGenerator(root, generatorPath);
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
              pushSchema(root);
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
              console.error("  \x1b[31m[cms]\x1b[0m Try running: npx drizzle-kit push --force");
            }
          }

          const configFilePath = path.join(root, configPath.replace(/\/?$/, ".ts"));
          let debounceTimer: ReturnType<typeof setTimeout> | null = null;

          watch(configFilePath, () => {
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
              console.log("  [cms] Config changed, regenerating...");
              try {
                runGenerator(root, generatorPath);
                pushSchema(root);
                console.log("  [cms] Schema updated.");
              } catch (error) {
                console.error("  [cms] Regeneration failed:", (error as Error).message);
              }
            }, 500);
          });
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
            `const _astroWorker = ${name};\nexport default {\n  fetch: (...args) => _astroWorker.fetch(...args),\n  async scheduled(event, env, ctx) {\n    const headers = env.CRON_SECRET ? { Authorization: "Bearer " + env.CRON_SECRET } : {};\n    const res = await _astroWorker.fetch(new Request("https://dummy/api/cms/cron/publish", { headers }), env, ctx);\n    if (!res.ok) console.error("Cron publish failed:", res.status, await res.text());\n    else console.log("Cron publish:", await res.text());\n  }\n};`,
        );
        writeFileSync(entryPath, content);
      },
    },
  };
}
