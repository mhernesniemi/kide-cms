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

const cwd = process.cwd();
const allowDirty = process.argv.includes("--allow-dirty");

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

const updateStamp = (patch: Record<string, unknown>) => {
  const stampPath = path.join(cwd, ".kide-version");
  if (!existsSync(stampPath)) return;
  const stamp = readJson(stampPath);
  writeFileSync(stampPath, `${JSON.stringify({ ...stamp, ...patch }, null, 2)}\n`);
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
  writeFileSync(rootPkgPath, `${JSON.stringify(rootPkg, null, 2)}\n`);

  updateStamp({ mode: "embedded", ejectedAt: new Date().toISOString() });

  console.log("[kide:eject] Running pnpm install...");
  try {
    execFileSync("pnpm", ["install"], { cwd, stdio: "inherit" });
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
