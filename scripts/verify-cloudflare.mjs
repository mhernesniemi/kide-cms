#!/usr/bin/env node
// Assembles the Cloudflare target like create-kide-app, then builds AND boots the worker
// (wrangler dev, local) and drives a real request through setup/login. Run: pnpm verify:cloudflare
import { execSync, spawn } from "node:child_process";
import { cpSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

const root = process.cwd();
const dir = mkdtempSync(path.join(tmpdir(), "kide-cf-verify-"));
const run = (cmd, cwd = dir) => execSync(cmd, { cwd, stdio: "inherit" });

try {
  console.log(`\n[cf-verify] assembling Cloudflare target in ${dir}`);
  cpSync(root, dir, {
    recursive: true,
    filter: (src) =>
      !/(^|\/)(node_modules|\.git|dist|\.astro|\.wrangler|\.cms-cache|data)(\/|$)/.test(src) &&
      !src.endsWith("/src/cms/.generated"),
  });

  const overlay = path.join(dir, "adapters/cloudflare");
  cpSync(path.join(overlay, "astro.config.mjs"), path.join(dir, "astro.config.mjs"));
  cpSync(path.join(overlay, "drizzle.config.ts"), path.join(dir, "drizzle.config.ts"));
  writeFileSync(path.join(dir, "src/cms/adapters/db.ts"), 'export * from "../platform/cloudflare/database";\n');
  writeFileSync(path.join(dir, "src/cms/adapters/storage.ts"), 'export * from "../platform/cloudflare/storage";\n');
  // database_id must be non-empty for local wrangler dev, even without a real D1.
  const wrangler = readFileSync(path.join(overlay, "wrangler.toml"), "utf8")
    .replaceAll("{{PROJECT_NAME}}", "cf-verify")
    .replace(/database_id = ""[^\n]*/, `database_id = "${randomUUID()}"`);
  writeFileSync(path.join(dir, "wrangler.toml"), wrangler);
  rmSync(path.join(dir, "adapters"), { recursive: true, force: true });

  const pkgPath = path.join(dir, "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  delete pkg.dependencies["@astrojs/node"];
  delete pkg.dependencies["sharp"];
  pkg.dependencies["@astrojs/cloudflare"] = "~14.1.7";
  if (pkg.dependencies["better-sqlite3"]) {
    pkg.devDependencies["better-sqlite3"] = pkg.dependencies["better-sqlite3"];
    delete pkg.dependencies["better-sqlite3"];
  }
  pkg.devDependencies["wrangler"] = "^4.83.0";
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));

  console.log("[cf-verify] installing + building");
  run("pnpm install --prefer-offline");
  run("pnpm cms:generate");
  run("pnpm exec astro build");
  console.log("[cf-verify] ✓ build clean");

  // D1 isn't migrated at boot; must use the same --config the dev server boots with below,
  // or migrations land in a different local D1 persistence path than the one served.
  run("pnpm exec wrangler d1 migrations apply cf-verify-db --local --config dist/server/wrangler.json");

  console.log("[cf-verify] booting the worker (wrangler dev, local) and driving real requests");
  await bootAndProbe(dir);
  console.log("\n[cf-verify] ✓ Cloudflare target builds AND serves requests without crashing");
} finally {
  rmSync(dir, { recursive: true, force: true });
}

async function bootAndProbe(dir) {
  const port = 18787;
  const child = spawn(
    "pnpm",
    ["exec", "wrangler", "dev", "--config", "dist/server/wrangler.json", "--port", String(port), "--local"],
    { cwd: dir, stdio: ["ignore", "pipe", "pipe"] },
  );
  let output = "";
  child.stdout.on("data", (d) => (output += d));
  child.stderr.on("data", (d) => (output += d));

  try {
    const base = `http://127.0.0.1:${port}`;
    await waitForServer(base, 60_000);

    // No admin yet → middleware must redirect to /admin/setup, not 500.
    const notReady = await fetch(`${base}/admin`, { redirect: "manual" });
    assert(
      notReady.status === 302 || notReady.status === 303,
      `GET /admin (no user) → ${notReady.status}, expected a redirect`,
    );

    // Drive setup — exercises the exact middleware path (serve()/cfContext) that crashed before.
    const setupBody = new URLSearchParams({
      name: "Verify Admin",
      email: "verify@example.com",
      password: "verify-cloudflare-password",
      confirmPassword: "verify-cloudflare-password",
    });
    const setupRes = await fetch(`${base}/api/cms/auth/setup`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: base },
      body: setupBody,
      redirect: "manual",
    });
    assert(setupRes.status < 500, `POST /api/cms/auth/setup → ${setupRes.status} ${await safeText(setupRes)}`);
    const cookie = setupRes.headers.get("set-cookie");
    assert(
      cookie,
      `setup did not return a session cookie. Location=${setupRes.headers.get("location")} headers=${JSON.stringify([...setupRes.headers.entries()])}`,
    );

    // Authenticated request through the same middleware path — must not 500.
    const admin = await fetch(`${base}/admin`, { headers: { cookie }, redirect: "manual" });
    assert(admin.status < 500, `GET /admin (authed) → ${admin.status}`);

    // Real R2 round-trip — catches a renamed/missing CMS_ASSETS binding.
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
    const uploadIsJson = (uploadRes.headers.get("content-type") ?? "").includes("application/json");
    assert(
      uploadRes.status < 400 && uploadIsJson,
      `POST /api/cms/assets/upload → ${uploadRes.status} (content-type: ${uploadRes.headers.get("content-type")})\n${uploadBody.slice(0, 500)}`,
    );
    const uploaded = JSON.parse(uploadBody);
    const storagePath = uploaded?.storagePath;
    assert(storagePath, `upload response had no storagePath: ${JSON.stringify(uploaded)}`);
    const served = await fetch(`${base}${storagePath}`);
    assert(served.status === 200, `GET ${storagePath} → ${served.status}`);
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
    throw new Error(`wrangler dev did not become ready within ${timeoutMs}ms.\n--- output ---\n${output}`);
  }

  function assert(cond, message) {
    if (!cond) throw new Error(`${message}\n--- wrangler dev output ---\n${output}`);
  }

  async function safeText(res) {
    try {
      return await res.text();
    } catch {
      return "";
    }
  }
}
