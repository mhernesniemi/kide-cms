#!/usr/bin/env node
// Local dev sandbox: assembles a starter into a self-contained sibling
// ../.preview/<starter>/ project, then watches this repo and syncs saved files
// into it while the server runs — the preview's own Vite hot-reloads them, so
// core/admin/starter edits show up live. Collection/config/seed changes also
// poke the preview's cms.config.ts so its integration regenerates the schema.
// Deleted files linger until --fresh (full reset, clean DB). No symlinks back
// to this repo: symlinked sources resolve deps from the wrong node_modules and
// duplicate react/@base-ui. Repo-only: excluded from create-kide-app scaffolds.
//
// Usage: pnpm dev:preview [starter] [--fresh] [--port=4326]
import { execSync, spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, watch } from "node:fs";
import path from "node:path";

const root = process.cwd();
const startersDir = path.join(root, "starters");
const previewRoot = path.join(root, "..", ".preview");

const args = process.argv.slice(2);
const fresh = args.includes("--fresh");
const portArg = args.find((a) => a.startsWith("--port="));
const port = portArg ? portArg.slice("--port=".length) : "4326";
const starterArg = args.find((a) => !a.startsWith("--"));

const availableStarters = existsSync(startersDir)
  ? readdirSync(startersDir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && existsSync(path.join(startersDir, e.name, "starter.json")))
      .map((e) => e.name)
  : [];

const starter = starterArg ?? (availableStarters.length === 1 ? availableStarters[0] : null);
if (!starter) {
  console.error(
    availableStarters.length === 0
      ? "[dev-preview] no starters found under starters/"
      : `[dev-preview] multiple starters available — pick one: pnpm dev:preview <${availableStarters.join("|")}>`,
  );
  process.exit(1);
}
if (!availableStarters.includes(starter)) {
  console.error(`[dev-preview] unknown starter "${starter}" — available: ${availableStarters.join(", ")}`);
  process.exit(1);
}

const previewDir = path.join(previewRoot, starter);
const overlayDir = path.join(startersDir, starter);
const run = (cmd) => execSync(cmd, { cwd: previewDir, stdio: "inherit" });

if (fresh) rmSync(previewDir, { recursive: true, force: true });

console.log(
  existsSync(previewDir)
    ? `[dev-preview] syncing sources into ${path.relative(root, previewDir)} (DB and caches persist — pass --fresh for a full reset)`
    : `[dev-preview] assembling "${starter}" in ${path.relative(root, previewDir)}`,
);

cpSync(root, previewDir, {
  recursive: true,
  filter: (src) =>
    !/(^|\/)(node_modules|\.git|dist|\.astro|\.wrangler|\.cms-cache|data|starters)(\/|$)/.test(src) &&
    src !== path.join(root, "src/cms/.generated"),
});
cpSync(overlayDir, previewDir, { recursive: true });
rmSync(path.join(previewDir, "starter.json"), { force: true });
rmSync(path.join(previewDir, "adapters"), { recursive: true, force: true });

run("pnpm install"); // fast on a warm store, and self-heals an interrupted install
clearStaleViteCache();
run("pnpm cms:push"); // runs cms:generate first; both no-op fast when nothing changed
if (existsSync(path.join(previewDir, "src/cms/seed.ts"))) run("pnpm exec kide seed"); // skips non-empty collections

// --- Live sync while the server runs ---

const IGNORE = /(^|\/)(node_modules|\.generated|\.git|\.astro|data|dist)(\/|$)|\.DS_Store$|^starter\.json$/;

// `pnpm install` can relink node_modules without changing the lockfile ("Already
// up to date"), and Vite keys its prebundle cache on the lockfile — so the cache
// survives, now built against different files. Hydration then dies across every
// island and a restart does not help, because a restart does not invalidate it.
function clearStaleViteCache() {
  const viteDir = path.join(previewDir, "node_modules/.vite");
  const viteMeta = path.join(viteDir, "deps/_metadata.json");
  const modulesState = path.join(previewDir, "node_modules/.modules.yaml");
  if (!existsSync(viteMeta) || !existsSync(modulesState)) return;
  if (statSync(modulesState).mtimeMs <= statSync(viteMeta).mtimeMs) return;
  rmSync(viteDir, { recursive: true, force: true });
  console.log("[dev-preview] cleared stale Vite dep cache (node_modules changed after it was built)");
}

// Injected routes are registered once, in the integration's astro:config:setup —
// syncing a new route file into a running server does nothing, and the request
// falls through to whatever else matches. Restart so the route actually exists.
let restartTimer = null;
let restarting = false;
// Without a TTY, `astro dev` detaches and our child exits immediately — the real
// server is a separate background process, so killing the child restarts nothing.
let detached = false;
const scheduleServerRestart = (reason) => {
  if (restartTimer) clearTimeout(restartTimer);
  restartTimer = setTimeout(() => {
    console.log(`[dev-preview] ${reason} — restarting the preview server to register routes`);
    restarting = true;
    if (detached) {
      try {
        run("pnpm exec astro dev stop");
      } catch {
        // already gone
      }
      restarting = false;
      detached = false;
      startServer();
    } else {
      child.kill();
    }
  }, 300);
};

// Schema-affecting syncs regenerate + push in the preview (debounced). The
// integration's own config watcher only reacts to cms.config.ts content
// changes, so it can't be piggybacked for collection-file edits.
let schemaTimer = null;
const scheduleSchemaRefresh = () => {
  if (schemaTimer) clearTimeout(schemaTimer);
  schemaTimer = setTimeout(() => {
    try {
      run("pnpm cms:push");
    } catch {
      console.error("[dev-preview] schema push failed — fix the collection file and save again");
    }
  }, 300);
};

const syncFile = (srcAbs, rel) => {
  if (IGNORE.test(rel) || !existsSync(srcAbs) || statSync(srcAbs).isDirectory()) return;
  const destAbs = path.join(previewDir, rel);
  const isNewFile = !existsSync(destAbs);
  mkdirSync(path.dirname(destAbs), { recursive: true });
  cpSync(srcAbs, destAbs);
  console.log(`[dev-preview] synced ${rel}`);
  if (/(^|\/)collections\//.test(rel) || rel.endsWith("cms.config.ts")) scheduleSchemaRefresh();
  if (rel.endsWith("internals/integration.ts")) scheduleServerRestart("integration changed");
  else if (isNewFile && /(^|\/)routes\//.test(rel)) scheduleServerRestart(`new route ${rel}`);
};

watch(path.join(root, "src"), { recursive: true }, (_, rel) => {
  if (!rel) return;
  const fromRoot = path.join("src", rel);
  if (existsSync(path.join(overlayDir, fromRoot))) return; // overlay owns this path
  syncFile(path.join(root, fromRoot), fromRoot);
});
watch(overlayDir, { recursive: true }, (_, rel) => {
  if (rel) syncFile(path.join(overlayDir, rel), rel);
});

let child;
const startServer = () => {
  child = spawn("pnpm", ["exec", "astro", "dev", "--port", port], { cwd: previewDir, stdio: "inherit" });
  child.on("exit", (code) => {
    if (restarting) {
      restarting = false;
      startServer();
      return;
    }
    if (code) process.exit(code);
    // Detached background server (non-TTY): stay alive so the watcher keeps syncing.
    detached = true;
    console.log("[dev-preview] watching for changes (Ctrl+C to stop)");
  });
};
startServer();
