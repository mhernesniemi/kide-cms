#!/usr/bin/env node
// Scaffolds every starter × mode × target with the real create-kide-app, from this repo's
// committed ref and a freshly packed @kidecms/core, then runs `pnpm dev` like a new user and
// fails on the first bad response or any logged error. Run: pnpm verify:scaffold
// Narrow with --starter=blank|<name> --mode=package|embedded --target=local|cloudflare.
// KIDE_SCAFFOLDER=/path/to/create-kide-app/index.js tests an unpublished scaffolder.
import { execFileSync, execSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const root = process.cwd();
const args = Object.fromEntries(
  process.argv
    .slice(2)
    .filter((arg) => arg.startsWith("--") && arg.includes("="))
    .map((arg) => arg.slice(2).split("=")),
);

const git = (...gitArgs) => execFileSync("git", gitArgs, { cwd: root, encoding: "utf-8" }).trim();
const ref =
  process.env.KIDE_SCAFFOLD_REF ||
  (process.env.GITHUB_REF_TYPE === "tag" ? process.env.GITHUB_REF_NAME : null) ||
  git("rev-parse", "--abbrev-ref", "HEAD");
if (ref === "HEAD") throw new Error("Detached HEAD: set KIDE_SCAFFOLD_REF to a branch or tag.");
if (git("status", "--porcelain")) {
  console.warn("[scaffold-verify] uncommitted changes are not tested: the scaffolder clones committed history");
}

const starters = [
  "blank",
  ...readdirSync(path.join(root, "starters"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(path.join(root, "starters", entry.name, "starter.json")))
    .map((entry) => entry.name),
];
const combos = starters
  .flatMap((starter) =>
    ["package", "embedded"].flatMap((mode) => ["local", "cloudflare"].map((target) => ({ starter, mode, target }))),
  )
  .filter((combo) => Object.entries(combo).every(([key, value]) => !args[key] || args[key] === value));
if (combos.length === 0) throw new Error("No combinations match the given filters.");

const dir = mkdtempSync(path.join(tmpdir(), "kide-scaffold-verify-"));
console.log(`\n[scaffold-verify] packing @kidecms/core into ${dir}`);
const tarball = execFileSync("pnpm", ["--filter", "@kidecms/core", "pack", "--pack-destination", dir], {
  cwd: root,
  encoding: "utf-8",
})
  .trim()
  .split("\n")
  .pop();

const scaffolder = process.env.KIDE_SCAFFOLDER
  ? ["node", [path.resolve(process.env.KIDE_SCAFFOLDER)]]
  : ["pnpm", ["dlx", "create-kide-app@latest"]];

const failures = [];
let port = 4400;

for (const { starter, mode, target } of combos) {
  const label = `${starter}/${mode}/${target}`;
  const name = `app-${starter}-${mode}-${target}`;
  const project = path.join(dir, name);
  let logs = "";
  console.log(`\n[scaffold-verify] ${label}: scaffolding from ${ref}`);

  try {
    execFileSync(
      scaffolder[0],
      [
        ...scaffolder[1],
        name,
        `--starter=${starter}`,
        `--mode=${mode}`,
        `--target=${target}`,
        "--no-github",
        "--no-dev",
        ...(target === "cloudflare" ? ["--no-cloudflare-setup"] : []),
        ...(target === "local" && starter !== "blank" ? ["--seed"] : []),
      ],
      {
        cwd: dir,
        stdio: "inherit",
        env: {
          ...process.env,
          KIDE_TEMPLATE_REPO: `file://${root}`,
          KIDE_TEMPLATE_REF: ref,
          ...(mode === "package" && { KIDE_CORE_SPEC: `file:${tarball}` }),
        },
      },
    );
    if (!existsSync(path.join(project, "node_modules"))) throw new Error("scaffold did not install dependencies");

    port += 1;
    console.log(`[scaffold-verify] ${label}: pnpm dev on :${port}`);
    execSync(`pnpm dev --background --port ${port}`, { cwd: project, stdio: "inherit" });

    try {
      const base = `http://localhost:${port}`;
      // The first request must already succeed: no warm-up or retry may hide a cold-start failure.
      const home = await fetch(`${base}/`, { redirect: "manual" });
      if (home.status >= 500) throw new Error(`first GET / → ${home.status}`);

      const admin = await fetch(`${base}/admin`, { redirect: "manual" });
      const location = admin.headers.get("location") ?? "";
      if (admin.status < 300 || admin.status >= 400 || !location.includes("/admin/setup")) {
        throw new Error(`GET /admin → ${admin.status} ${location}, expected a redirect to /admin/setup`);
      }
      const setup = await fetch(new URL(location, base));
      if (setup.status !== 200) throw new Error(`GET /admin/setup → ${setup.status}`);
    } finally {
      try {
        logs = execSync("pnpm exec astro dev logs", { cwd: project, encoding: "utf-8" });
      } catch {
        // no logs to report
      }
      execSync("pnpm exec astro dev stop", { cwd: project, stdio: "ignore" });
    }

    const errors = logs.split("\n").filter((line) => /"level":"error"|\[ERROR\]|Internal server error/.test(line));
    if (errors.length > 0) throw new Error(`dev server logged errors:\n${errors.join("\n").slice(0, 4000)}`);

    console.log(`[scaffold-verify] ✓ ${label}`);
    rmSync(project, { recursive: true, force: true });
  } catch (error) {
    console.error(`[scaffold-verify] ✗ ${label}: ${error.message}`);
    if (logs) console.error(`--- dev server logs ---\n${logs.slice(-6000)}`);
    console.error(`(project kept at ${project})`);
    failures.push(label);
  }
}

if (failures.length > 0) {
  console.error(`\n[scaffold-verify] ${failures.length}/${combos.length} failed: ${failures.join(", ")}`);
  process.exit(1);
}
console.log(`\n[scaffold-verify] ✓ all ${combos.length} scaffolds start and serve their first request`);
rmSync(dir, { recursive: true, force: true });
