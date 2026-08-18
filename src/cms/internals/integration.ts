import type { AstroIntegration } from "astro";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, watch, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

// All runtime files resolve relative to this module, never the project root, so
// the integration works identically embedded (workspace package in the project
// tree) and installed from the registry. realpath because pnpm links packages
// via symlinks and Vite/Tailwind watch real paths.
const packageDir = realpathSync(path.dirname(fileURLToPath(import.meta.url)));
const packageRoot = path.dirname(packageDir);
const packagePath = (...segments: string[]) => path.join(packageRoot, ...segments);
const requireFromPackage = createRequire(import.meta.url);

// Locate a file inside a dependency without going through its exports map
// (needed for CSS-only packages whose exports have no importable condition).
const resolvePackageFile = (pkg: string, file: string) => {
  for (const base of requireFromPackage.resolve.paths(pkg) ?? []) {
    const candidate = path.join(base, pkg, file);
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(`[kide] Could not locate ${file} in package "${pkg}".`);
};

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

        // Generate a wrapper CSS that adds @source directives and imports user's admin CSS
        const adminDir = packagePath("admin");
        const routesDir = packagePath("routes");
        // tw-animate-css is a CSS-only package (exports only a "style" condition),
        // so Node resolution can't reach into it — walk the module paths instead.
        const twAnimateCssPath = resolvePackageFile("tw-animate-css", "dist/tw-animate.css");
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

        // Generate custom field components barrel (user-authored fields live
        // project-side in src/cms/fields/, outside the managed runtime dirs)
        const customFieldsDir = path.resolve(root, "src/cms/fields");
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
                "virtual:kide/content-renderer": path.resolve(root, "src/components/ContentRenderer.astro"),
                "virtual:kide/admin-css": wrapperCss,
                "virtual:kide/custom-fields": customFieldsBarrel,
              },
              // Two React copies (project + package) break hooks/context identity.
              dedupe: ["react", "react-dom"],
            },
            // The package ships TypeScript/Astro source — Vite must compile it
            // rather than treat it as an external Node dependency in SSR.
            ssr: {
              noExternal: ["@kidecms/core"],
            },
            // Pre-bundle admin component deps.
            //
            // Admin components live under src/cms/admin/ but are only reached via injected
            // routes, so Vite's default dep scanner (which starts from index.html) skips
            // them entirely. Without pre-bundling, packages like @tiptap/react are served
            // raw to the browser; their CJS sub-deps (use-sync-external-store/shim) break
            // ESM imports; React hydration silently fails; fields render but don't respond
            // to clicks (and appear to "disappear" when interacted with).
            //
            // `entries` points the dep scanner directly at every admin source file. We
            // include admin/, the injected routes, .generated/ (api.ts, schema.ts), and
            // client/ — all paths that can introduce a browser-side dep. If any one is
            // missing and a request hits a code path with an undiscovered dep, Vite
            // re-optimizes mid-session, which 504s in-flight chunk requests with
            // "Outdated Optimize Dep" and breaks hydration on whatever tab is open
            // (appears as random "React fields stop working" failures).
            //
            // We intentionally do NOT set `force: true` here. Forcing re-optimization on
            // every dev start regenerates chunk hashes, which 504s any browser tab opened
            // before the restart. Vite's content-based hash already invalidates correctly
            // when deps change. For the rare case where the pre-bundle cache is genuinely
            // corrupt, run `pnpm dev:clean` to nuke and rebuild.
            optimizeDeps: {
              entries: [
                path.join(adminDir, "**/*.{ts,tsx,astro}"),
                path.join(routesDir, "admin/**/*.astro"),
                path.resolve(root, generatedPath, "**/*.ts"),
                packagePath("client", "**/*.ts"),
              ],
            },
          },
        });

        // Inject admin pages
        injectRoute({ pattern: "/admin/login", entrypoint: new URL("../routes/admin/login.astro", import.meta.url) });
        injectRoute({
          pattern: "/admin/forgot-password",
          entrypoint: new URL("../routes/admin/forgot-password.astro", import.meta.url),
        });
        injectRoute({
          pattern: "/admin/reset-password",
          entrypoint: new URL("../routes/admin/reset-password.astro", import.meta.url),
        });
        injectRoute({ pattern: "/admin/setup", entrypoint: new URL("../routes/admin/setup.astro", import.meta.url) });
        injectRoute({ pattern: "/admin/invite", entrypoint: new URL("../routes/admin/invite.astro", import.meta.url) });
        injectRoute({
          pattern: "/admin/assets",
          entrypoint: new URL("../routes/admin/assets/index.astro", import.meta.url),
        });
        injectRoute({
          pattern: "/admin/assets/[id]",
          entrypoint: new URL("../routes/admin/assets/[id].astro", import.meta.url),
        });
        injectRoute({
          pattern: "/admin/[...path]",
          entrypoint: new URL("../routes/admin/[...path].astro", import.meta.url),
        });

        // /uploads/* streams from the storage adapter (Node: uploads dir, CF: R2).
        // Both platforms need it: Node's static layer only serves files that
        // existed at build time, so runtime uploads 404 in production without it.
        injectRoute({
          pattern: "/uploads/[...path]",
          entrypoint: new URL("../routes/uploads/[...path].ts", import.meta.url),
        });

        // Inject API routes
        injectRoute({
          pattern: "/api/cms/auth/login",
          entrypoint: new URL("../routes/api/auth/login.ts", import.meta.url),
        });
        injectRoute({
          pattern: "/api/cms/auth/forgot-password",
          entrypoint: new URL("../routes/api/auth/forgot-password.ts", import.meta.url),
        });
        injectRoute({
          pattern: "/api/cms/auth/reset-password",
          entrypoint: new URL("../routes/api/auth/reset-password.ts", import.meta.url),
        });
        injectRoute({
          pattern: "/api/cms/auth/sso/[provider]/start",
          entrypoint: new URL("../routes/api/auth/sso/[provider]/start.ts", import.meta.url),
        });
        injectRoute({
          pattern: "/api/cms/auth/logout",
          entrypoint: new URL("../routes/api/auth/logout.ts", import.meta.url),
        });
        injectRoute({
          pattern: "/api/cms/auth/setup",
          entrypoint: new URL("../routes/api/auth/setup.ts", import.meta.url),
        });
        injectRoute({
          pattern: "/api/cms/auth/invite",
          entrypoint: new URL("../routes/api/auth/invite.ts", import.meta.url),
        });
        injectRoute({
          pattern: "/api/cms/assets/upload",
          entrypoint: new URL("../routes/api/assets/upload.ts", import.meta.url),
        });
        injectRoute({
          pattern: "/api/cms/assets/folders",
          entrypoint: new URL("../routes/api/assets/folders.ts", import.meta.url),
        });
        injectRoute({
          pattern: "/api/cms/assets/[id]",
          entrypoint: new URL("../routes/api/assets/[id].ts", import.meta.url),
        });
        injectRoute({
          pattern: "/api/cms/assets",
          entrypoint: new URL("../routes/api/assets/index.ts", import.meta.url),
        });
        injectRoute({
          pattern: "/api/cms/collaboration",
          entrypoint: new URL("../routes/api/collaboration/index.ts", import.meta.url),
        });
        injectRoute({
          pattern: "/api/cms/edit-bar",
          entrypoint: new URL("../routes/api/edit-bar.ts", import.meta.url),
        });
        injectRoute({
          pattern: "/api/cms/ai/alt-text",
          entrypoint: new URL("../routes/api/ai/alt-text.ts", import.meta.url),
        });
        injectRoute({ pattern: "/api/cms/ai/seo", entrypoint: new URL("../routes/api/ai/seo.ts", import.meta.url) });
        injectRoute({
          pattern: "/api/cms/ai/translate",
          entrypoint: new URL("../routes/api/ai/translate.ts", import.meta.url),
        });
        injectRoute({
          pattern: "/api/cms/cron/publish",
          entrypoint: new URL("../routes/api/cron/publish.ts", import.meta.url),
        });
        injectRoute({
          pattern: "/api/cms/cron/tasks",
          entrypoint: new URL("../routes/api/cron/tasks.ts", import.meta.url),
        });
        injectRoute({
          pattern: "/api/cms/webhooks/[provider]",
          entrypoint: new URL("../routes/api/webhooks/[provider].ts", import.meta.url),
        });
        injectRoute({
          pattern: "/api/cms/forms/submit/[slug]",
          entrypoint: new URL("../routes/api/forms/submit/[slug].ts", import.meta.url),
        });
        injectRoute({
          pattern: "/api/cms/locks/[...path]",
          entrypoint: new URL("../routes/api/locks/[...path].ts", import.meta.url),
        });
        // Preview render route uses Astro Container API which depends on Vite internals.
        // Only inject in dev mode — production builds (especially Cloudflare Workers) can't bundle it.
        if (command === "dev") {
          injectRoute({
            pattern: "/api/cms/preview/render",
            entrypoint: new URL("../routes/api/preview/render.ts", import.meta.url),
          });
        }
        injectRoute({
          pattern: "/api/cms/references/[collection]/[id]",
          entrypoint: new URL("../routes/api/references/[collection]/[id].ts", import.meta.url),
        });
        injectRoute({
          pattern: "/api/cms/img/[...path]",
          entrypoint: new URL("../routes/api/img/[...path].ts", import.meta.url),
        });
        injectRoute({
          pattern: "/api/cms/admin/search",
          entrypoint: new URL("../routes/api/admin/search.ts", import.meta.url),
        });
        injectRoute({
          pattern: "/api/cms/[collection]/[...path]",
          entrypoint: new URL("../routes/api/[collection]/[...path].ts", import.meta.url),
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
