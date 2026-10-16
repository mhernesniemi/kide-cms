import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin, ResolvedConfig } from "vite";
import { analyzeSharedDeps, formatConflicts } from "./shared-deps";

// Resolved relative to this module (realpath: pnpm links packages via symlinks and
// Vite/Tailwind watch real paths), so embedded and installed modes behave the same.
const packageRoot = path.dirname(realpathSync(path.dirname(fileURLToPath(import.meta.url))));
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

export interface KideViteOptions {
  /** Project root (default: process.cwd()). */
  root?: string;
  /** Path to the CMS config file (default: "src/cms/cms.config") */
  configPath?: string;
  /** Path to the CMS runtime file (default: "src/cms/runtime") */
  runtimePath?: string;
  /** Path to the generated output directory (default: "src/cms/.generated") */
  generatedPath?: string;
  /** Path to the adapters directory (default: "src/cms/adapters") */
  adaptersPath?: string;
  /**
   * Host files the live-preview render endpoint uses: the block/content renderers, and
   * for hosts whose components can't await, the module that prepares block data.
   */
  renderers?: { block: string; content: string; blockData?: string };
}

const ASSETS_ID = "virtual:kide/admin-assets";
const RESOLVED_ASSETS_ID = "\0" + ASSETS_ID;
const SCRIPT_FILE = "_kide/admin.js";
const STYLE_FILE = "_kide/admin.css";
const REACT_PREAMBLE = `import { injectIntoGlobalHook } from "/@react-refresh";
injectIntoGlobalHook(window);
window.$RefreshReg$ = () => {};
window.$RefreshSig$ = () => (type) => type;`;

// Wrapper stylesheet: Tailwind sources + the core admin chrome + the project's
// theme file. Chrome (layers, focus, editor styles, variants) is core-owned and
// updates with the package; the project file defines only color tokens.
function writeAdminCss(root: string, generatedDir: string) {
  const adminDir = packagePath("admin");
  const file = path.join(generatedDir, "admin.css");
  writeFileSync(
    file,
    [
      `@source "${adminDir}";`,
      `@source "${packagePath("routes")}";`,
      `@import "${path.join(adminDir, "admin-base.css")}";`,
      // tw-animate-css is CSS-only (exports only a "style" condition), so Node resolution can't reach it.
      `@import "${resolvePackageFile("tw-animate-css", "dist/tw-animate.css")}";`,
      `@import "${path.resolve(root, "src/styles/admin.css")}";`,
      "",
    ].join("\n"),
  );
  return file;
}

// User-authored admin fields live project-side in src/cms/fields/, outside the managed dirs.
function writeCustomFieldsBarrel(root: string, generatedDir: string) {
  const fieldsDir = path.resolve(root, "src/cms/fields");
  const file = path.join(generatedDir, "custom-fields.ts");
  const imports = existsSync(fieldsDir)
    ? readdirSync(fieldsDir)
        .filter((f) => f.endsWith(".tsx"))
        .map((f) => `  "${f.replace(".tsx", "")}": (await import("${path.join(fieldsDir, f)}")).default,`)
    : [];
  writeFileSync(file, `export const customFields: Record<string, any> = {\n${imports.join("\n")}\n};\n`);
  return file;
}

/**
 * Everything Kide needs from the host's Vite: the virtual:kide/* modules, the
 * admin stylesheet and custom-field barrel, dependency setup, and the admin's
 * browser bundle. Hosts add these plugins; Astro's integration does it for you.
 */
export function kide(options: KideViteOptions = {}): Plugin[] {
  const root = options.root ?? process.cwd();
  const generatedDir = path.join(root, "node_modules", ".kide");
  mkdirSync(generatedDir, { recursive: true });
  const adminCss = writeAdminCss(root, generatedDir);
  const customFields = writeCustomFieldsBarrel(root, generatedDir);
  const generatedPath = options.generatedPath ?? "src/cms/.generated";
  const adaptersPath = options.adaptersPath ?? "src/cms/adapters";

  // One copy per library the admin shares with the project — see shared-deps.ts.
  const sharedDeps = analyzeSharedDeps({
    projectRoot: root,
    packageFile: packagePath("package.json"),
    dependencies: JSON.parse(readFileSync(packagePath("package.json"), "utf8")).dependencies ?? {},
  });

  const configPlugin: Plugin = {
    name: "kide:config",
    config: () => ({
      resolve: {
        alias: {
          "virtual:kide/config": path.resolve(root, options.configPath ?? "src/cms/cms.config"),
          "virtual:kide/api": path.resolve(root, generatedPath, "api"),
          "virtual:kide/schema": path.resolve(root, generatedPath, "schema"),
          "virtual:kide/runtime": path.resolve(root, options.runtimePath ?? "src/cms/runtime"),
          "virtual:kide/db": path.resolve(root, adaptersPath, "db"),
          "virtual:kide/email": path.resolve(root, adaptersPath, "email"),
          "virtual:kide/storage": path.resolve(root, adaptersPath, "storage"),
          ...(options.renderers && {
            "virtual:kide/block-renderer": path.resolve(root, options.renderers.block),
            "virtual:kide/content-renderer": path.resolve(root, options.renderers.content),
          }),
          ...(options.renderers?.blockData && {
            "virtual:kide/block-data": path.resolve(root, options.renderers.blockData),
          }),
          "virtual:kide/admin-css": adminCss,
          "virtual:kide/custom-fields": customFields,
        },
        // Two React copies (project + package) break hooks/context identity, and two
        // copies of any admin UI library break Vite's pre-bundling (shared-deps.ts).
        dedupe: ["react", "react-dom", ...sharedDeps.dedupe],
      },
      // The package ships TypeScript source — Vite must compile it rather than
      // treat it as an external Node dependency in SSR.
      ssr: {
        noExternal: ["@kidecms/core"],
      },
      // Pre-bundle admin component deps.
      //
      // Admin components live under src/cms/admin/ but are only reached via Kide's
      // router, so Vite's default dep scanner (which starts from index.html) skips
      // them entirely. Without pre-bundling, packages like @tiptap/react are served
      // raw to the browser; their CJS sub-deps (use-sync-external-store/shim) break
      // ESM imports; React hydration silently fails; fields render but don't respond
      // to clicks (and appear to "disappear" when interacted with).
      //
      // `entries` points the dep scanner directly at every admin source file. We
      // include admin/, the admin pages, .generated/ (api.ts, schema.ts), and
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
        // Generated under node_modules/, so the optimizer would pre-bundle it like a
        // dependency and keep serving a stale copy after a field is added.
        exclude: ["virtual:kide/custom-fields"],
        entries: [
          packagePath("admin", "**/*.{ts,tsx}"),
          packagePath("routes", "admin/**/*.tsx"),
          path.resolve(root, generatedPath, "**/*.ts"),
          packagePath("client", "**/*.ts"),
        ],
      },
    }),
    configResolved(config) {
      if (sharedDeps.conflicts.length > 0) config.logger.warn(formatConflicts(sharedDeps.conflicts));
    },
  };

  return [configPlugin, kideAdminAssets({ clientEntry: packagePath("admin", "client", "entry.ts"), adminCss })];
}

/**
 * Builds the admin's browser bundle through whatever Vite the host runs. The
 * entry is emitted under fixed file names so the server build, which runs before
 * the client build, can reference it without a manifest; a per-build id busts caches.
 */
function kideAdminAssets(options: { clientEntry: string; adminCss: string }): Plugin {
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
      const entry = bundle[SCRIPT_FILE];
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
