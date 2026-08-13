/**
 * `kide eject` — convert a package-mode project to embedded mode by copying the
 * installed @kidecms/core source into src/cms/ and linking it as a pnpm
 * workspace package. Import specifiers are identical in both modes, so no code
 * changes — only where the package resolves from.
 *
 * `kide eject --undo` — reverse it, but only when every ejected file is still
 * pristine (hash-verified against the manifest written at eject time). Undoing
 * with local edits would discard work, so a dirty tree is refused unless
 * --force is passed explicitly.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MANAGED_DIRS = ["admin", "client", "core", "internals", "middleware", "platform", "routes"];
const MANIFEST_PATH = ".kide/eject-manifest.json";

const cwd = process.cwd();
const undo = process.argv.includes("--undo");
const force = process.argv.includes("--force");
const allowDirty = process.argv.includes("--allow-dirty");

// This file lives inside the installed package, so its own location IS the
// source to eject (realpath resolves pnpm's symlink into the store).
const packageRoot = path.dirname(realpathSync(path.dirname(fileURLToPath(import.meta.url))));

const corePath = path.join(cwd, "src/cms");
const rootPkgPath = path.join(cwd, "package.json");

const sha256 = (file: string) => createHash("sha256").update(readFileSync(file)).digest("hex");

const walkFiles = (dir: string, base = dir): string[] =>
  readdirSync(dir).flatMap((entry) => {
    if (entry === "node_modules") return [];
    const full = path.join(dir, entry);
    return statSync(full).isDirectory() ? walkFiles(full, base) : [path.relative(base, full)];
  });

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

const pnpmInstall = () => {
  console.log("[kide:eject] Running pnpm install...");
  try {
    execFileSync("pnpm", ["install"], { cwd, stdio: "inherit" });
  } catch {
    console.error("[kide:eject] pnpm install failed — run it manually to finish.");
  }
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

  const version = readJson(path.join(packageRoot, "package.json")).version as string;
  console.log(`[kide:eject] Ejecting @kidecms/core@${version} into src/cms/`);

  const manifest: { version: string; files: Record<string, string> } = { version, files: {} };
  for (const dir of MANAGED_DIRS) {
    cpSync(path.join(packageRoot, dir), path.join(corePath, dir), {
      recursive: true,
      // Judge only the path below the package root — the installed package's own
      // absolute path contains node_modules segments (pnpm store).
      filter: (src) => !path.relative(packageRoot, src).split(path.sep).includes("node_modules"),
    });
  }
  cpSync(path.join(packageRoot, "package.json"), path.join(corePath, "package.json"));
  for (const dir of MANAGED_DIRS) {
    for (const file of walkFiles(path.join(corePath, dir))) {
      const rel = path.join(dir, file);
      manifest.files[rel] = sha256(path.join(corePath, rel));
    }
  }
  manifest.files["package.json"] = sha256(path.join(corePath, "package.json"));

  mkdirSync(path.join(cwd, ".kide"), { recursive: true });
  writeFileSync(path.join(cwd, MANIFEST_PATH), `${JSON.stringify(manifest, null, 2)}\n`);

  const workspacePath = path.join(cwd, "pnpm-workspace.yaml");
  if (!existsSync(workspacePath)) {
    writeFileSync(workspacePath, "packages:\n  - src/cms\n");
  }

  rootPkg.dependencies["@kidecms/core"] = "workspace:*";
  writeFileSync(rootPkgPath, `${JSON.stringify(rootPkg, null, 2)}\n`);

  updateStamp({ mode: "embedded", ejectedAt: new Date().toISOString() });
  pnpmInstall();

  console.log("[kide:eject] Done. The CMS runtime now lives in src/cms/ — read, debug, and modify it freely.");
  console.log("[kide:eject] Future upgrades use the release-packet flow (pnpm cms:upgrade).");
  console.log("[kide:eject] Commit the ejected files. `kide eject --undo` works while they stay unmodified.");
};

const undoEject = () => {
  const manifestFile = path.join(cwd, MANIFEST_PATH);
  if (!existsSync(manifestFile)) {
    throw new Error(`No ${MANIFEST_PATH} found — this project wasn't ejected by \`kide eject\`.`);
  }
  const manifest = readJson(manifestFile) as { version: string; files: Record<string, string> };

  const changed: string[] = [];
  const missing: string[] = [];
  for (const [rel, hash] of Object.entries(manifest.files)) {
    const file = path.join(corePath, rel);
    if (!existsSync(file)) missing.push(rel);
    else if (sha256(file) !== hash) changed.push(rel);
  }
  const extra = MANAGED_DIRS.flatMap((dir) =>
    existsSync(path.join(corePath, dir))
      ? walkFiles(path.join(corePath, dir))
          .map((f) => path.join(dir, f))
          .filter((rel) => !(rel in manifest.files))
      : [],
  );

  if ((changed.length || missing.length || extra.length) && !force) {
    if (changed.length) console.error(`[kide:eject] Modified since eject:\n  ${changed.join("\n  ")}`);
    if (missing.length) console.error(`[kide:eject] Missing since eject:\n  ${missing.join("\n  ")}`);
    if (extra.length) console.error(`[kide:eject] Added since eject:\n  ${extra.join("\n  ")}`);
    throw new Error(
      "Refusing to undo — the ejected runtime has local changes that would be discarded. Rerun with --force to discard them anyway.",
    );
  }

  console.log(`[kide:eject] Restoring package mode (@kidecms/core@^${manifest.version})`);
  for (const dir of MANAGED_DIRS) {
    rmSync(path.join(corePath, dir), { recursive: true, force: true });
  }
  rmSync(path.join(corePath, "package.json"), { force: true });
  rmSync(path.join(cwd, "pnpm-workspace.yaml"), { force: true });
  rmSync(manifestFile, { force: true });

  const rootPkg = readJson(rootPkgPath);
  rootPkg.dependencies["@kidecms/core"] = `^${manifest.version}`;
  writeFileSync(rootPkgPath, `${JSON.stringify(rootPkg, null, 2)}\n`);

  updateStamp({ mode: "package", unejectedAt: new Date().toISOString() });
  pnpmInstall();

  console.log("[kide:eject] Done. The CMS runtime is a package dependency again.");
};

try {
  if (undo) undoEject();
  else eject();
} catch (error) {
  console.error(`[kide:eject] ${(error as Error).message}`);
  process.exit(1);
}
