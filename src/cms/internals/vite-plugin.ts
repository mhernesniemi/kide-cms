import { createHash } from "node:crypto";
import path from "node:path";
import type { Plugin, ResolvedConfig } from "vite";

export interface AdminAssetsPluginOptions {
  /** Absolute path to the admin browser entry. */
  clientEntry: string;
  /** Absolute path to the generated admin stylesheet. */
  adminCss: string;
}

const ASSETS_ID = "virtual:kide/admin-assets";
const RESOLVED_ASSETS_ID = "\0" + ASSETS_ID;
const OUT_DIR = "_kide";
const SCRIPT_FILE = `${OUT_DIR}/admin.js`;
const STYLE_FILE = `${OUT_DIR}/admin.css`;
const REACT_PREAMBLE = `import { injectIntoGlobalHook } from "/@react-refresh";
injectIntoGlobalHook(window);
window.$RefreshReg$ = () => {};
window.$RefreshSig$ = () => (type) => type;`;

/**
 * Builds the admin's browser bundle through whatever Vite the host runs (Astro,
 * SvelteKit, …). The entry is emitted under fixed file names so the server build,
 * which runs before the client build, can reference it without a manifest; a
 * per-build id busts caches.
 */
export function kideAdminAssets(options: AdminAssetsPluginOptions): Plugin {
  const buildId = createHash("sha256").update(`${Date.now()}:${Math.random()}`).digest("hex").slice(0, 10);
  let config: ResolvedConfig;

  return {
    name: "kide:admin-assets",
    configResolved(resolved) {
      config = resolved;
      // Appended after resolution: setting `allow` from a plugin's config() would replace
      // Vite's default workspace allowlist instead of extending it.
      resolved.server.fs.allow.push(path.dirname(options.clientEntry), path.dirname(options.adminCss));
    },
    resolveId(id) {
      if (id === ASSETS_ID) return RESOLVED_ASSETS_ID;
    },
    load(id) {
      if (id !== RESOLVED_ASSETS_ID) return;
      if (config.command === "serve") {
        const reactRefresh = config.plugins.some((plugin) => plugin.name === "vite:react-refresh");
        const fsUrl = (file: string) => `/@fs${file.split(path.sep).join("/")}`;
        return `export default ${JSON.stringify({
          scripts: [fsUrl(options.clientEntry)],
          styles: [`${fsUrl(options.adminCss)}?direct`],
          inlineModules: reactRefresh ? [REACT_PREAMBLE] : [],
        })};`;
      }
      return `export default ${JSON.stringify({
        scripts: [`/${SCRIPT_FILE}?v=${buildId}`],
        styles: [`/${STYLE_FILE}?v=${buildId}`],
        inlineModules: [],
      })};`;
    },
    buildStart() {
      if (config.command !== "build" || this.environment?.name !== "client") return;
      this.emitFile({ type: "chunk", id: options.clientEntry, fileName: SCRIPT_FILE });
    },
    generateBundle(_, bundle) {
      if (this.environment?.name !== "client") return;
      const entry = Object.values(bundle).find((item) => item.type === "chunk" && item.fileName === SCRIPT_FILE);
      if (!entry || entry.type !== "chunk") return;
      const cssFiles = new Set<string>();
      const collect = (fileName: string, seen = new Set<string>()) => {
        if (seen.has(fileName)) return;
        seen.add(fileName);
        const chunk = bundle[fileName];
        if (!chunk || chunk.type !== "chunk") return;
        for (const css of chunk.viteMetadata?.importedCss ?? []) cssFiles.add(css);
        for (const dep of chunk.imports) collect(dep, seen);
      };
      collect(entry.fileName);
      const css = [...cssFiles]
        .map((fileName) => {
          const asset = bundle[fileName];
          return asset?.type === "asset" ? String(asset.source) : "";
        })
        .join("\n");
      this.emitFile({ type: "asset", fileName: STYLE_FILE, source: css });
    },
  };
}
