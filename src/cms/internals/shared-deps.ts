// Libraries the admin shares with the host project.
//
// The admin's React islands import the package's own UI dependencies
// (@base-ui/react, lucide-react, TipTap, …). When the project installs its own
// copy of one of them — typically by adding shadcn/ui components for the public
// site — the browser graph contains two copies under one bare specifier. Vite
// pre-bundles each specifier once, so the two copies keep invalidating each
// other's bundle: requests 504 with "Outdated Optimize Dep", admin islands fail
// to hydrate, and every rich field renders empty (the data itself is fine).
//
// Resolution: when the project's copy satisfies the range this package declares,
// dedupe to it (one copy, and the admin runs on a version it supports). When it
// doesn't, deduping could break the admin, so warn with the exact fix instead.

import { existsSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";

/** Package dependencies that never reach the browser — no hydration risk. */
const SERVER_ONLY = new Set([
  "ai",
  "@ai-sdk/openai",
  "@modelcontextprotocol/sdk",
  "drizzle-kit",
  "tsx",
  "tw-animate-css",
]);

type Version = [number, number, number];

const parseVersion = (value: string): Version | null => {
  const match = value.trim().match(/^v?(\d+)\.(\d+)\.(\d+)/);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
};

const compare = (a: Version, b: Version) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

/**
 * Whether `version` falls inside `range`. Supports the forms package manifests
 * actually use here: `^x.y.z`, `~x.y.z` and exact `x.y.z`. Returns null for
 * anything else, so callers can stay silent instead of guessing.
 */
export const satisfiesRange = (version: string, range: string): boolean | null => {
  const v = parseVersion(version);
  const operator = range.trim().match(/^[\^~]/)?.[0] ?? "";
  const base = parseVersion(range.trim().slice(operator.length));
  if (!v || !base) return null;
  if (!/^[\^~]?v?\d+\.\d+\.\d+$/.test(range.trim())) return null;
  if (operator === "") return compare(v, base) === 0;
  if (compare(v, base) < 0) return false;
  if (operator === "~") return v[0] === base[0] && v[1] === base[1];
  // Caret: the left-most non-zero component is fixed.
  if (base[0] > 0) return v[0] === base[0];
  if (base[1] > 0) return v[0] === 0 && v[1] === base[1];
  return v[0] === 0 && v[1] === 0 && v[2] === base[2];
};

export type SharedDepConflict = { name: string; range: string; projectVersion: string };

export type SharedDepReport = {
  /** Deduped to the project's copy (compatible with this package's range). */
  dedupe: string[];
  /** Project copies outside this package's range — the admin keeps its own. */
  conflicts: SharedDepConflict[];
};

/**
 * Directory of the copy of `name` that `fromFile` resolves through its own
 * node_modules chain. Deliberately not `require.resolve.paths()`: that appends
 * NODE_PATH, which `pnpm dev`/`pnpm exec` point at pnpm's hoisted store, so every
 * package would appear to have a project copy.
 */
const locatePackage = (name: string, fromFile: string): string | null => {
  let dir = path.dirname(path.resolve(fromFile));
  for (;;) {
    const manifest = path.join(dir, "node_modules", name, "package.json");
    if (existsSync(manifest)) return realpathSync(path.dirname(manifest));
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
};

const readVersion = (dir: string) => {
  try {
    return String(JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8")).version ?? "");
  } catch {
    return "";
  }
};

/**
 * Compare this package's browser dependencies with the copies the project
 * resolves from its root. Only packages the project actually has a separate copy
 * of are reported.
 */
export const analyzeSharedDeps = (options: {
  projectRoot: string;
  /** A file inside this package, used as the resolution origin for its own deps. */
  packageFile: string;
  dependencies: Record<string, string>;
}): SharedDepReport => {
  const projectFile = path.join(options.projectRoot, "package.json");
  const report: SharedDepReport = { dedupe: [], conflicts: [] };

  for (const [name, range] of Object.entries(options.dependencies)) {
    if (SERVER_ONLY.has(name)) continue;
    const projectDir = locatePackage(name, projectFile);
    const packageDir = locatePackage(name, options.packageFile);
    if (!projectDir || !packageDir || projectDir === packageDir) continue;

    const projectVersion = readVersion(projectDir);
    const compatible = satisfiesRange(projectVersion, range);
    if (compatible === true) report.dedupe.push(name);
    else if (compatible === false) report.conflicts.push({ name, range, projectVersion });
  }
  return report;
};

export const formatConflicts = (conflicts: SharedDepConflict[]) =>
  [
    "This project installs its own copy of libraries the admin uses, at versions the admin doesn't support:",
    ...conflicts.map((c) => `         ${c.name} ${c.projectVersion} (admin requires ${c.range})`),
    '       Two copies make Vite re-bundle dependencies in a loop (504 "Outdated Optimize Dep"), so admin',
    "       editors fail to load and fields look empty. Align the project's versions, then run `pnpm dev:clean`:",
    `         pnpm add ${conflicts.map((c) => `${c.name}@"${c.range}"`).join(" ")}`,
  ].join("\n");
