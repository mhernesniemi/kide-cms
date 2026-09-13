#!/usr/bin/env node
// Verifies the UPGRADE path from the previous release to HEAD — the thing users
// actually do, which a fresh assembly (verify:package, verify:starters) never
// exercises. Two flows, both starting from a project scaffolded the way a user
// got it at the previous v* tag:
//
//   package  — thin template + @kidecms/core packed from the previous tag, then
//              `pnpm add` HEAD's tarball; must check + build + boot, and the only
//              files allowed to change are package.json and pnpm-lock.yaml.
//   embedded — the tag's tree (barebone + each starter it shipped) stamped with
//              .kide-version, upgraded with HEAD's `kide upgrade <HEAD>`; the
//              careful-review.patch must be a dependency bump only (see
//              assertCarefulPatch), the managed patch must apply, and the
//              project must still check + build.
//
// Both flows compare committed trees: HEAD is `git archive HEAD`, not the
// working tree, because `kide upgrade` diffs commits. Commit before running.
//
// The previous tag is the highest v* tag reachable from HEAD that does not
// point at HEAD itself (so a release-tag push compares against the release
// before it). CI needs the full history + tags (`fetch-depth: 0`).
// Override with PREV_TAG=v0.x.y. Run: pnpm verify:upgrade
import { execFileSync, execSync, spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const root = process.cwd();
const dir = mkdtempSync(path.join(tmpdir(), "kide-upgrade-verify-"));
const run = (cmd, cwd) => execSync(cmd, { cwd, stdio: "inherit" });
const git = (args, cwd = root) => execFileSync("git", args, { cwd, encoding: "utf-8" }).trim();
const log = (msg) => console.log(`[upgrade-verify] ${msg}`);
const fail = (msg) => {
  throw new Error(`[upgrade-verify] ${msg}`);
};

// Managed dirs are deleted from a package-mode scaffold — the tarball provides them.
const MANAGED = ["admin", "client", "core", "internals", "middleware", "platform", "routes"];
const CLI = path.join(root, "src/cms/internals/cli.mjs");
const REPO_URL = "https://github.com/mhernesniemi/kide-cms";

const headCommit = git(["rev-parse", "HEAD"]);
const prevTag = process.env.PREV_TAG || discoverPreviousTag();
const prevCommit = git(["rev-parse", `${prevTag}^{commit}`]);
if (prevCommit === headCommit) fail(`${prevTag} points at HEAD — nothing to upgrade from`);
log(`previous release: ${prevTag} (${prevCommit.slice(0, 7)}) → HEAD (${headCommit.slice(0, 7)})`);

try {
  const prevTree = path.join(dir, "prev-tree");
  const headTree = path.join(dir, "head-tree");
  exportTree(prevTag, prevTree);
  exportTree("HEAD", headTree);

  log(`packing @kidecms/core from ${prevTag} and HEAD`);
  const prevTarball = pack(prevTree, path.join(dir, "prev-pack"));
  const headTarball = pack(headTree, path.join(dir, "head-pack"));

  await verifyPackageMode(prevTree, prevTarball, headTarball);

  const starters = listStarters(prevTree);
  if (starters.length === 0) {
    verifyEmbedded(prevTree, null);
  } else {
    for (const starter of starters) verifyEmbedded(prevTree, starter);
  }

  console.log(`\n[upgrade-verify] ✓ ${prevTag} → HEAD upgrades cleanly in package and embedded mode`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}

// --- previous tag ---------------------------------------------------------

function discoverPreviousTag() {
  const atHead = new Set(git(["tag", "--points-at", "HEAD", "--list", "v*"]).split("\n").filter(Boolean));
  const reachable = git(["tag", "--merged", "HEAD", "--list", "v*", "--sort=-v:refname"])
    .split("\n")
    .filter((tag) => tag && !atHead.has(tag));
  if (reachable.length === 0) {
    fail(
      "no previous v* tag reachable from HEAD. Fetch the full history and tags (CI: actions/checkout with fetch-depth: 0), or set PREV_TAG=v0.x.y.",
    );
  }
  return reachable[0];
}

// --- assembly helpers -----------------------------------------------------

// `git archive` of a ref — exactly the committed tree, no ignored/untracked files.
function exportTree(ref, dest) {
  mkdirSync(dest, { recursive: true });
  execSync(`git archive ${ref} | tar -x -C "${dest}"`, { cwd: root, stdio: "inherit" });
}

function pack(tree, dest) {
  mkdirSync(dest, { recursive: true });
  const out = execFileSync("pnpm", ["pack", "--pack-destination", dest], {
    cwd: path.join(tree, "src/cms"),
    encoding: "utf-8",
  });
  const tarball = out.trim().split("\n").pop();
  if (!existsSync(tarball)) fail(`pnpm pack did not produce a tarball in ${dest}`);
  return tarball;
}

function listStarters(tree) {
  const startersDir = path.join(tree, "starters");
  if (!existsSync(startersDir)) return [];
  return readdirSync(startersDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(path.join(startersDir, entry.name, "starter.json")))
    .map((entry) => entry.name);
}

function copyTemplate(tree, project) {
  cpSync(tree, project, { recursive: true });
  rmSync(path.join(project, "starters"), { recursive: true, force: true });
  rmSync(path.join(project, "adapters"), { recursive: true, force: true });
}

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

function writeJson(file, value) {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

// Snapshot the scaffold so the post-upgrade diff is exact. `kide upgrade` also
// needs a clean git worktree to auto-apply the managed patch (git apply --3way).
function commitAll(project, message) {
  const g = (args) => git(["-c", "user.name=verify", "-c", "user.email=verify@example.com", ...args], project);
  if (!existsSync(path.join(project, ".git"))) g(["init", "--quiet", "--initial-branch=main"]);
  g(["add", "-A"]);
  g(["commit", "--quiet", "--allow-empty", "-m", message]);
}

function changedFiles(project) {
  // Not via git(): its trim() would eat the leading status column (" M path").
  const out = execFileSync("git", ["status", "--porcelain", "--untracked-files=all"], {
    cwd: project,
    encoding: "utf-8",
  });
  return out
    .split("\n")
    .filter(Boolean)
    .map((line) => line.slice(3).trim());
}

// --- package mode ---------------------------------------------------------

async function verifyPackageMode(prevTree, prevTarball, headTarball) {
  const project = path.join(dir, "package-app");
  log(`package mode: scaffolding ${prevTag} project in ${project}`);
  copyTemplate(prevTree, project);
  for (const managed of MANAGED) rmSync(path.join(project, "src/cms", managed), { recursive: true, force: true });
  rmSync(path.join(project, "src/cms/package.json"), { force: true });
  rmSync(path.join(project, "pnpm-workspace.yaml"), { force: true });

  // Mirror create-kide-app's package-mode pruning: the runtime (worker tests,
  // Cloudflare type profile, upstream distribution tooling) lives in node_modules.
  const pkgPath = path.join(project, "package.json");
  const pkg = readJson(pkgPath);
  pkg.dependencies["@kidecms/core"] = `file:${prevTarball}`;
  for (const script of [
    "verify:pack",
    "verify:package",
    "verify:cloudflare",
    "verify:starters",
    "verify:upgrade",
    "dev:preview",
    "cms:upgrade",
    "cms:restore",
    "test:workers",
    "check:cloudflare",
    "test:fixtures",
  ]) {
    delete pkg.scripts[script];
  }
  pkg.scripts.check = "astro check && eslint .";
  pkg.scripts.test = "pnpm cms:generate && vitest run --passWithNoTests";
  delete pkg.devDependencies["@cloudflare/vitest-pool-workers"];
  delete pkg.devDependencies["@cloudflare/workers-types"];
  delete pkg.devDependencies["jsdom"];
  writeJson(pkgPath, pkg);
  rmSync(path.join(project, "scripts"), { recursive: true, force: true });
  rmSync(path.join(project, "vitest.workers.config.ts"), { force: true });
  rmSync(path.join(project, "tsconfig.cloudflare.json"), { force: true });

  // --no-frozen-lockfile: the dep swap diverges from the lockfile; CI defaults to frozen.
  run("pnpm install --prefer-offline --no-frozen-lockfile", project);
  run("pnpm cms:generate", project);
  commitAll(project, `scaffold from ${prevTag}`);

  log(`package mode: upgrading @kidecms/core to HEAD (${path.basename(headTarball)})`);
  run(`pnpm add "${headTarball}"`, project);
  const installed = readJson(path.join(project, "node_modules/@kidecms/core/package.json")).version;
  const expected = readJson(path.join(root, "src/cms/package.json")).version;
  if (installed !== expected) fail(`installed @kidecms/core ${installed}, expected HEAD's ${expected}`);

  run("pnpm cms:generate", project);
  run("pnpm cms:push", project);
  run("pnpm check", project);
  run("pnpm exec astro build", project);
  log("package mode: ✓ check + build clean after the bump");

  await bootAndProbe(project, 18789);
  log("package mode: ✓ upgraded server boots and serves setup/login");

  const changed = changedFiles(project);
  const unexpected = changed.filter((file) => file !== "package.json" && file !== "pnpm-lock.yaml");
  if (unexpected.length > 0) {
    fail(
      `package mode: upgrading @kidecms/core changed files outside package.json/pnpm-lock.yaml — a dependency bump must not touch project files:\n  ${unexpected.join("\n  ")}`,
    );
  }
  log(`package mode: ✓ only ${changed.join(", ")} changed`);
}

// --- embedded mode --------------------------------------------------------

function verifyEmbedded(prevTree, starter) {
  const label = starter ? `starter "${starter}"` : "barebone template";
  const project = path.join(dir, `embedded-${starter ?? "barebone"}`);
  log(`embedded mode: scaffolding ${label} from ${prevTag} in ${project}`);
  copyTemplate(prevTree, project);
  if (starter) {
    cpSync(path.join(prevTree, "starters", starter), project, { recursive: true });
    rmSync(path.join(project, "starter.json"), { force: true });
  }

  // The provenance stamp create-kide-app writes for embedded scaffolds.
  const coreVersion = readJson(path.join(prevTree, "src/cms/package.json")).version;
  writeJson(path.join(project, ".kide-version"), {
    template: REPO_URL,
    kideVersion: coreVersion,
    ref: prevTag,
    commit: prevCommit,
    target: "node",
    mode: "embedded",
    starter,
    corePath: "src/cms",
  });
  commitAll(project, `scaffold ${label} from ${prevTag}`);

  // HEAD's upgrade command, targeting HEAD's commit in this repo (the "upstream").
  log(`embedded mode: running HEAD's kide upgrade ${headCommit.slice(0, 7)}`);
  run(`node "${CLI}" upgrade ${headCommit} --repo "${root}" --agent none`, project);

  const latest = readJson(path.join(project, ".kide/upgrade/latest.json"));
  const packet = path.join(project, latest.packet);
  const conflicts = readJson(path.join(packet, "conflicts.json"));
  const managedPatch = readFileSync(path.join(packet, "managed-runtime.patch"), "utf8");
  if (managedPatch.trim() && !conflicts.applied) {
    fail(`embedded mode: managed patch did not apply cleanly: ${conflicts.applyError ?? "unknown error"}`);
  }
  if (conflicts.applied) {
    const stamp = readJson(path.join(project, ".kide-version"));
    if (stamp.ref !== headCommit) fail(`embedded mode: .kide-version ref is ${stamp.ref}, expected ${headCommit}`);
  }
  log(
    `embedded mode: managed ${conflicts.changedFiles.managed.length} · careful ${conflicts.changedFiles.careful.length} · other ${conflicts.changedFiles.other.length} file(s)`,
  );

  const carefulPatch = readFileSync(path.join(packet, "careful-review.patch"), "utf8");
  assertCarefulPatch(carefulPatch);
  if (carefulPatch.trim()) {
    // What a user does with a dependency-bump-only careful patch: take it.
    git(["apply", "--3way", path.relative(project, path.join(packet, "careful-review.patch"))], project);
  }
  const otherOutsideCms = conflicts.changedFiles.other.filter((file) => file.startsWith("src/cms/"));
  if (otherOutsideCms.length > 0) {
    // Not managed, not careful — kide upgrade neither applies nor flags these.
    log(`embedded mode: note — unclassified src/cms changes left untouched: ${otherOutsideCms.join(", ")}`);
  }

  run("pnpm install --prefer-offline --no-frozen-lockfile", project);
  run("pnpm cms:generate", project);
  run("pnpm cms:push", project);
  run("pnpm check", project);
  run("pnpm exec astro build", project);
  log(`embedded mode: ✓ ${label} checks and builds after the upgrade`);
}

// The careful-review patch is the project-owned surface: it must be empty, or
// at most the release's own version bump (root package.json `version` moves
// with every tag) plus dependency range bumps and the lockfile that follows
// them. Anything else — scripts, astro/tsconfig/drizzle config, cms.config,
// collections, adapters, runtime.ts — is a change every user has to hand-merge
// and fails the gate. Set KIDE_VERIFY_ALLOW_CAREFUL=1 for a release that
// intentionally changes project-owned files (document it in the CHANGELOG).
function assertCarefulPatch(patch) {
  if (!patch.trim()) {
    log("embedded mode: ✓ careful-review.patch is empty");
    return;
  }
  const files = [...patch.matchAll(/^diff --git a\/(.+?) b\//gm)].map((m) => m[1]);
  const problems = [];
  for (const file of files) {
    if (file === "pnpm-lock.yaml") continue;
    if (file !== "package.json") {
      problems.push(`${file}: project-owned file changed upstream`);
      continue;
    }
    const section = patch.slice(patch.indexOf(`diff --git a/${file} b/`));
    const end = section.indexOf("\ndiff --git ", 1);
    const body = end === -1 ? section : section.slice(0, end);
    const changedLines = body
      .split("\n")
      .filter((line) => /^[+-](?![+-]{2} )/.test(line))
      .map((line) => line.slice(1).trim());
    // `"version": "0.27.2",` / `"astro": "^7.3.2",` / `"packageManager": "pnpm@10.27.0",` —
    // the value must be a version or range, so a changed script or config key is caught.
    const allowed =
      /^"(version|[@a-z0-9][\w./@-]*)":\s*"((?:\^|~|>=|<=|>|<|=)?\d+\.\d+\.\d+[\w.+-]*|pnpm@\d+\.\d+\.\d+)",?$/;
    for (const line of changedLines) {
      if (!allowed.test(line)) problems.push(`package.json: ${line}`);
    }
  }
  if (problems.length === 0) {
    log(`embedded mode: ✓ careful-review.patch is a dependency bump only (${files.join(", ")})`);
    return;
  }
  const message = `embedded mode: careful-review.patch is not a dependency bump only — every ${prevTag} user must hand-merge:\n  ${problems.join("\n  ")}`;
  if (process.env.KIDE_VERIFY_ALLOW_CAREFUL === "1") {
    log(`WARNING ${message}`);
    return;
  }
  fail(message);
}

// --- boot probe -----------------------------------------------------------

async function bootAndProbe(project, port) {
  const child = spawn("node", ["dist/server/entry.mjs"], {
    cwd: project,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, PORT: String(port), HOST: "127.0.0.1" },
  });
  let output = "";
  child.stdout.on("data", (d) => (output += d));
  child.stderr.on("data", (d) => (output += d));
  const assert = (cond, message) => {
    if (!cond) throw new Error(`[upgrade-verify] ${message}\n--- server output ---\n${output}`);
  };

  try {
    const base = `http://127.0.0.1:${port}`;
    const start = Date.now();
    for (;;) {
      try {
        await fetch(`${base}/admin`, { method: "HEAD", redirect: "manual" });
        break;
      } catch {
        assert(Date.now() - start < 30_000, "server did not become ready within 30s");
        await new Promise((r) => setTimeout(r, 500));
      }
    }

    // No admin yet → middleware must redirect to /admin/setup, not 500.
    const notReady = await fetch(`${base}/admin`, { redirect: "manual" });
    assert([302, 303].includes(notReady.status), `GET /admin (no user) → ${notReady.status}, expected a redirect`);

    const setupRes = await fetch(`${base}/api/cms/auth/setup`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: base },
      body: new URLSearchParams({
        name: "Verify Admin",
        email: "verify@example.com",
        password: "verify-upgrade-password",
        confirmPassword: "verify-upgrade-password",
      }),
      redirect: "manual",
    });
    assert(setupRes.status < 500, `POST /api/cms/auth/setup → ${setupRes.status}`);
    const cookie = setupRes.headers.get("set-cookie");
    assert(cookie, `setup did not return a session cookie (status ${setupRes.status})`);

    const admin = await fetch(`${base}/admin`, { headers: { cookie }, redirect: "manual" });
    assert(admin.status < 500, `GET /admin (authed) → ${admin.status}`);
  } finally {
    child.kill("SIGTERM");
  }
}
