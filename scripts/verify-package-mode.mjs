#!/usr/bin/env node
// Assembles a PACKAGE-MODE project from HEAD — the thin template with
// @kidecms/core installed from a freshly packed tarball instead of the
// embedded workspace — then builds, boots the Node server, and drives real
// requests through setup/login/upload. This is the anti-drift gate proving the
// same source serves both distribution modes. Run: pnpm verify:package
import { execFileSync, execSync, spawn } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const root = process.cwd();
const dir = mkdtempSync(path.join(tmpdir(), "kide-pkg-verify-"));
const run = (cmd, cwd = dir) => execSync(cmd, { cwd, stdio: "inherit" });

// Managed dirs are deleted from the scaffold — the tarball provides them.
const MANAGED = ["admin", "client", "core", "internals", "middleware", "platform", "routes"];

try {
  console.log(`\n[pkg-verify] packing @kidecms/core`);
  const packOut = execFileSync("pnpm", ["--filter", "@kidecms/core", "pack", "--pack-destination", dir], {
    cwd: root,
    encoding: "utf-8",
  });
  const tarball = packOut.trim().split("\n").pop();

  console.log(`[pkg-verify] assembling package-mode project in ${dir}`);
  const project = path.join(dir, "app");
  cpSync(root, project, {
    recursive: true,
    filter: (src) =>
      !/(^|\/)(node_modules|\.git|dist|\.astro|\.wrangler|\.cms-cache|data)(\/|$)/.test(src) &&
      !src.endsWith("/src/cms/.generated"),
  });
  for (const managed of MANAGED) rmSync(path.join(project, "src/cms", managed), { recursive: true, force: true });
  rmSync(path.join(project, "src/cms/package.json"), { force: true });
  rmSync(path.join(project, "pnpm-workspace.yaml"), { force: true });
  rmSync(path.join(project, "adapters"), { recursive: true, force: true });

  const pkgPath = path.join(project, "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  pkg.dependencies["@kidecms/core"] = `file:${tarball}`;
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
  // Keep pnpm-lock.yaml: only the @kidecms/core dep re-resolves; everything else
  // stays pinned (mirrors how create-kide-app scaffolds from a cloned tag).

  console.log("[pkg-verify] installing + building");
  run("pnpm install --prefer-offline", project);
  run("pnpm cms:generate", project);
  run("pnpm cms:push", project);
  run("pnpm exec astro build", project);
  console.log("[pkg-verify] ✓ build clean");

  console.log("[pkg-verify] booting the Node server and driving real requests");
  await bootAndProbe(project);
  console.log("[pkg-verify] ✓ package mode builds AND serves requests without crashing");

  console.log("[pkg-verify] testing eject → undo round-trip");
  verifyEjectRoundTrip(project);
  console.log("\n[pkg-verify] ✓ package mode + eject round-trip verified");
} finally {
  rmSync(dir, { recursive: true, force: true });
}

function verifyEjectRoundTrip(project) {
  const read = (p) => readFileSync(path.join(project, p), "utf8");
  const dep = () => JSON.parse(read("package.json")).dependencies["@kidecms/core"];
  const exists = (p) => existsSync(path.join(project, p));
  const check = (cond, msg) => {
    if (!cond) throw new Error(`[pkg-verify] eject: ${msg}`);
  };

  run("pnpm exec kide eject", project);
  check(exists("src/cms/core/index.ts"), "src/cms/core missing after eject");
  check(exists("src/cms/package.json"), "src/cms/package.json missing after eject");
  check(exists("pnpm-workspace.yaml"), "pnpm-workspace.yaml missing after eject");
  check(dep() === "workspace:*", `dependency is ${dep()}, expected workspace:*`);
  run("pnpm cms:generate", project); // embedded mode must still generate via the workspace bin

  // A modified managed file must make --undo refuse (exit non-zero) without --force.
  const probeFile = path.join(project, "src/cms/core/index.ts");
  const original = readFileSync(probeFile, "utf8");
  writeFileSync(probeFile, `${original}\n// local edit\n`);
  let refused = false;
  try {
    execSync("pnpm exec kide eject --undo", { cwd: project, stdio: "pipe" });
  } catch {
    refused = true;
  }
  check(refused, "--undo did not refuse a modified runtime");
  writeFileSync(probeFile, original);

  run("pnpm exec kide eject --undo", project);
  check(!exists("src/cms/core"), "src/cms/core still present after undo");
  check(!exists("pnpm-workspace.yaml"), "pnpm-workspace.yaml still present after undo");
  check(/^\^\d+\.\d+\.\d+/.test(dep()), `dependency is ${dep()}, expected a ^version`);
}

async function bootAndProbe(project) {
  const port = 18788;
  const child = spawn("node", ["dist/server/entry.mjs"], {
    cwd: project,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, PORT: String(port), HOST: "127.0.0.1" },
  });
  let output = "";
  child.stdout.on("data", (d) => (output += d));
  child.stderr.on("data", (d) => (output += d));

  try {
    const base = `http://127.0.0.1:${port}`;
    await waitForServer(base, 30_000);

    // No admin yet → middleware must redirect to /admin/setup, not 500.
    const notReady = await fetch(`${base}/admin`, { redirect: "manual" });
    assert(
      notReady.status === 302 || notReady.status === 303,
      `GET /admin (no user) → ${notReady.status}, expected a redirect`,
    );

    const setupBody = new URLSearchParams({
      name: "Verify Admin",
      email: "verify@example.com",
      password: "verify-package-mode-password",
      confirmPassword: "verify-package-mode-password",
    });
    const setupRes = await fetch(`${base}/api/cms/auth/setup`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: base },
      body: setupBody,
      redirect: "manual",
    });
    assert(setupRes.status < 500, `POST /api/cms/auth/setup → ${setupRes.status} ${await safeText(setupRes)}`);
    const cookie = setupRes.headers.get("set-cookie");
    assert(cookie, `setup did not return a session cookie (status ${setupRes.status})`);

    const admin = await fetch(`${base}/admin`, { headers: { cookie }, redirect: "manual" });
    assert(admin.status < 500, `GET /admin (authed) → ${admin.status}`);

    // Asset round-trip through the node storage adapter.
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const form = new FormData();
    form.set("file", new Blob([png], { type: "image/png" }), "probe.png");
    const uploadRes = await fetch(`${base}/api/cms/assets/upload`, {
      method: "POST",
      headers: { cookie, Origin: base },
      body: form,
      redirect: "manual",
    });
    const uploadBody = await safeText(uploadRes);
    assert(uploadRes.status < 400, `POST /api/cms/assets/upload → ${uploadRes.status}\n${uploadBody.slice(0, 500)}`);
  } finally {
    child.kill("SIGTERM");
  }

  async function waitForServer(base, timeoutMs) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        await fetch(`${base}/admin`, { method: "HEAD", redirect: "manual" });
        return;
      } catch {
        await new Promise((r) => setTimeout(r, 500));
      }
    }
    throw new Error(`server did not become ready within ${timeoutMs}ms.\n--- output ---\n${output}`);
  }

  function assert(cond, message) {
    if (!cond) throw new Error(`${message}\n--- server output ---\n${output}`);
  }

  async function safeText(res) {
    try {
      return await res.text();
    } catch {
      return "";
    }
  }
}
