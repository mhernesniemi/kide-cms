import type { AstroIntegration } from "astro";
import { existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defaultGeneratorPath, runGenerator, scheduledWorkerSource, startDevSchemaSync } from "./dev-tasks";
import { kide } from "./vite-plugin";

// All runtime files resolve relative to this module, never the project root, so
// the integration works identically embedded (workspace package in the project
// tree) and installed from the registry. realpath because pnpm links packages
// via symlinks and Vite/Tailwind watch real paths.
const packageDir = realpathSync(path.dirname(fileURLToPath(import.meta.url)));
const packageRoot = path.dirname(packageDir);
const packagePath = (...segments: string[]) => path.join(packageRoot, ...segments);

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

export default function cmsIntegration(options?: CmsIntegrationOptions): AstroIntegration {
  const configPath = options?.configPath ?? "src/cms/cms.config";
  const runtimePath = options?.runtimePath ?? "src/cms/runtime";
  const generatedPath = options?.generatedPath ?? "src/cms/.generated";
  const adaptersPath = options?.adaptersPath ?? "src/cms/adapters";
  const generatorPath = options?.generatorPath ?? defaultGeneratorPath;
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

        runGenerator(root, generatorPath);
        if (command === "dev") startDevSchemaSync(root, configPath, generatorPath);
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
          (_, name) => `const _astroWorker = ${name};\n${scheduledWorkerSource("_astroWorker")}`,
        );
        writeFileSync(entryPath, content);
      },
    },
  };
}
