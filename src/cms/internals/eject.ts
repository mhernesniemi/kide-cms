/**
 * `kide eject` — convert a package-mode project to embedded mode by copying the
 * installed @kidecms/core source into src/cms/ and linking it as a pnpm
 * workspace package. Import specifiers are identical in both modes, so no code
 * changes — only where the package resolves from.
 *
 * Ejecting is one-way: from here on you own the runtime source and upgrades
 * use the release-packet flow. To try embedded mode without committing, run
 * eject on a branch. For a single small tweak in package mode, prefer
 * `pnpm patch @kidecms/core` over ejecting.
 */
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MANAGED_DIRS = ["admin", "client", "core", "internals", "middleware", "platform", "routes"];

const USAGE = `Usage: kide eject [--allow-dirty]

Copies the installed @kidecms/core source into src/cms/ and links it as a pnpm
workspace package. One-way — evaluate on a branch, or use \`pnpm patch\` for
small package-mode tweaks.

Options:
  --allow-dirty   Eject even with uncommitted changes in the worktree
  --help          Show this help`;

// Strict argv handling: this command is irreversible, so an unrecognized flag
// (including the removed --undo/--force) must never fall through into eject.
let allowDirty = false;
for (const arg of process.argv.slice(2)) {
  if (arg === "--allow-dirty") {
    allowDirty = true;
  } else if (arg === "--help" || arg === "-h") {
    console.log(USAGE);
    process.exit(0);
  } else if (arg === "--undo" || arg === "--force") {
    console.error(`[kide:eject] ${arg} was removed — eject is one-way. Re-scaffold in package mode to go back.`);
    process.exit(1);
  } else {
    console.error(`[kide:eject] Unknown option: ${arg}\n\n${USAGE}`);
    process.exit(1);
  }
}

const cwd = process.cwd();

// This file lives inside the installed package, so its own location IS the
// source to eject (realpath resolves pnpm's symlink into the store).
const packageRoot = path.dirname(realpathSync(path.dirname(fileURLToPath(import.meta.url))));

const corePath = path.join(cwd, "src/cms");
const rootPkgPath = path.join(cwd, "package.json");

const gitIsDirty = () => {
  try {
    return (
      execFileSync("git", ["status", "--porcelain"], {
        cwd,
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "pipe"],
      }).trim().length > 0
    );
  } catch {
    return false; // not a git repo — nothing to protect
  }
};

const readJson = (file: string) => JSON.parse(readFileSync(file, "utf-8"));

// Eject is where the version stamp becomes meaningful: the vendored files'
// baseline is the installed package version, and the patch-upgrade flow diffs
// against it. Package-mode scaffolds carry no stamp, so create one here.
const writeStamp = (version: string) => {
  const stampPath = path.join(cwd, ".kide-version");
  const existing = existsSync(stampPath) ? readJson(stampPath) : {};
  const stamp = {
    template: "https://github.com/mhernesniemi/kide-cms",
    ...existing,
    kideVersion: version,
    ref: `v${version}`,
    commit: null,
    mode: "embedded",
    corePath: "src/cms",
    ejectedAt: new Date().toISOString(),
  };
  writeFileSync(stampPath, `${JSON.stringify(stamp, null, 2)}\n`);
};

const eject = () => {
  const rootPkg = readJson(rootPkgPath);
  if (!rootPkg.dependencies?.["@kidecms/core"]) {
    throw new Error("package.json has no @kidecms/core dependency — nothing to eject.");
  }
  if (existsSync(path.join(corePath, "core"))) {
    throw new Error("src/cms/core already exists — this project looks embedded already.");
  }
  if (!allowDirty && gitIsDirty()) {
    throw new Error("The worktree has uncommitted changes. Commit/stash them first, or rerun with --allow-dirty.");
  }

  // A pre-existing workspace file is the user's — never overwrite it, and only
  // proceed when src/cms is already listed (checked before any mutation).
  const workspacePath = path.join(cwd, "pnpm-workspace.yaml");
  const hasWorkspaceFile = existsSync(workspacePath);
  if (hasWorkspaceFile && !/(^|\s)-\s*["']?src\/cms["']?\s*$/m.test(readFileSync(workspacePath, "utf-8"))) {
    throw new Error(
      'pnpm-workspace.yaml exists but does not list src/cms. Add "- src/cms" under `packages:` and rerun.',
    );
  }

  const version = readJson(path.join(packageRoot, "package.json")).version as string;
  console.log(`[kide:eject] Ejecting @kidecms/core@${version} into src/cms/`);

  for (const dir of MANAGED_DIRS) {
    cpSync(path.join(packageRoot, dir), path.join(corePath, dir), {
      recursive: true,
      // Judge only the path below the package root — the installed package's own
      // absolute path contains node_modules segments (pnpm store).
      filter: (src) => !path.relative(packageRoot, src).split(path.sep).includes("node_modules"),
    });
  }
  cpSync(path.join(packageRoot, "package.json"), path.join(corePath, "package.json"));

  if (!hasWorkspaceFile) {
    writeFileSync(workspacePath, "packages:\n  - src/cms\n");
  }

  rootPkg.dependencies["@kidecms/core"] = "workspace:*";
  // The patch-upgrade flow starts existing at eject — make its scripts reachable.
  rootPkg.scripts = rootPkg.scripts ?? {};
  rootPkg.scripts["cms:upgrade"] ??= "kide upgrade";
  rootPkg.scripts["cms:restore"] ??= "kide restore";
  writeFileSync(rootPkgPath, `${JSON.stringify(rootPkg, null, 2)}\n`);

  writeStamp(version);

  console.log("[kide:eject] Running pnpm install...");
  try {
    // --no-frozen-lockfile: eject just rewrote the dep spec, so the lockfile is always stale here
    execFileSync("pnpm", ["install", "--no-frozen-lockfile"], { cwd, stdio: "inherit" });
  } catch {
    console.error(
      "[kide:eject] Files are ejected and package.json is updated, but pnpm install failed.\n" +
        "[kide:eject] Fix the install error and run `pnpm install` to finish — no other step is pending.",
    );
    process.exit(1);
  }

  console.log("[kide:eject] Done. The CMS runtime now lives in src/cms/ — read, debug, and modify it freely.");
  console.log("[kide:eject] Ejecting is one-way; future upgrades use the release-packet flow (pnpm cms:upgrade).");
};

try {
  eject();
} catch (error) {
  console.error(`[kide:eject] ${(error as Error).message}`);
  process.exit(1);
}
