import type { Plugin } from "vite";
import { defaultGeneratorPath, runGenerator, startDevSchemaSync } from "../dev-tasks";
import { kide, type KideViteOptions } from "../vite-plugin";

export interface KideSvelteKitOptions extends KideViteOptions {
  /** Absolute path to the generator script (default: the package's own generator) */
  generatorPath?: string;
}

/**
 * Kide for SvelteKit: add next to `sveltekit()` in vite.config.ts, and export
 * `handle` from `@kidecms/core/sveltekit/hooks` in src/hooks.server.ts.
 */
export function kideSvelteKit(options: KideSvelteKitOptions = {}): Plugin[] {
  const root = options.root ?? process.cwd();
  const generatorPath = options.generatorPath ?? defaultGeneratorPath;
  let generated = false;
  let syncing = false;

  const host: Plugin = {
    name: "kide:sveltekit",
    // Runs before module resolution, so .generated/ exists when routes import it.
    // Once per process: SvelteKit's server and client builds share one.
    config() {
      if (!generated) {
        generated = true;
        runGenerator(root, generatorPath);
      }
      // The admin is React; a SvelteKit project has no React plugin to compile its JSX.
      return { oxc: { jsx: { runtime: "automatic", importSource: "react" } } };
    },
    configureServer(server) {
      if (!syncing) {
        syncing = true;
        startDevSchemaSync(root, options.configPath ?? "src/cms/cms.config", generatorPath);
      }
      server.httpServer?.once("listening", () => {
        const url = server.resolvedUrls?.local[0];
        if (url) console.log(`  \x1b[36m[cms]\x1b[0m Admin panel: \x1b[36m${new URL("/admin", url)}\x1b[0m`);
      });
    },
  };

  return [
    host,
    ...kide({
      ...options,
      root,
      renderers: options.renderers ?? {
        block: "src/lib/kide/BlockRenderer.svelte",
        content: "src/lib/kide/ContentRenderer.svelte",
      },
    }),
  ];
}
