#!/usr/bin/env node
// Assembles the SvelteKit target (adapters/sveltekit overlay over this repo, Astro userland
// removed), type-checks and builds it, then boots it — Node server, or the Worker under
// `wrangler dev` for --target=cloudflare — and drives real requests through setup, the
// admin, uploads, a published page and live preview (plus the cron trigger on Cloudflare).
// Run: node scripts/verify-sveltekit.mjs [--starter=marketing] [--target=cloudflare] [--mode=package]
//      KEEP=1 leaves the assembled project in place.
import { execSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const root = process.cwd();
const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const starter = arg("starter");
const target = arg("target") ?? "node";
const cloudflare = target === "cloudflare";
// package: install a packed @kidecms/core instead of the embedded workspace runtime.
const packageMode = arg("mode") === "package";
const MANAGED = ["admin", "client", "core", "internals", "middleware", "platform", "routes"];
const projectName = "sk-verify";
const dir = mkdtempSync(path.join(tmpdir(), "kide-sveltekit-verify-"));
const run = (cmd, cwd = dir, env = {}) => execSync(cmd, { cwd, stdio: "inherit", env: { ...process.env, ...env } });

try {
  console.log(`\n[sveltekit-verify] assembling SvelteKit target in ${dir}`);
  cpSync(root, dir, {
    recursive: true,
    filter: (src) =>
      !/(^|\/)(node_modules|\.git|dist|build|\.astro|\.svelte-kit|\.wrangler|\.cms-cache|data)(\/|$)/.test(src) &&
      !src.endsWith("/src/cms/.generated"),
  });

  for (const astroOnly of [
    "astro.config.mjs",
    "tsconfig.cloudflare.json",
    "src/env.d.ts",
    "src/pages",
    "src/layouts",
    "src/components",
    "starters",
  ]) {
    rmSync(path.join(dir, astroOnly), { recursive: true, force: true });
  }
  // Astro's favicon.ico; the overlay brings the Svelte favicon.svg.
  rmSync(path.join(dir, "public/favicon.ico"), { force: true });
  const overlay = path.join(dir, "adapters/sveltekit");
  cpSync(overlay, dir, {
    recursive: true,
    filter: (src) =>
      !src.endsWith("README.md") &&
      !src.endsWith("package.patch.json") &&
      !src.startsWith(path.join(overlay, "cloudflare")),
  });
  if (cloudflare) {
    // Mirrors the Astro Cloudflare target: the D1/R2 profile lives in src/cms/platform/cloudflare,
    // so only configs are swapped and the two platform selectors flipped.
    cpSync(path.join(overlay, "cloudflare/vite.config.ts"), path.join(dir, "vite.config.ts"));
    cpSync(path.join(overlay, "cloudflare/src"), path.join(dir, "src"), { recursive: true });
    rmSync(path.join(dir, "server.js"));
    cpSync(path.join(dir, "adapters/cloudflare/drizzle.config.ts"), path.join(dir, "drizzle.config.ts"));
    // database_id must be non-empty for local wrangler dev, even without a real D1.
    const wrangler = readFileSync(path.join(overlay, "cloudflare/wrangler.toml"), "utf8")
      .replaceAll("{{PROJECT_NAME}}", projectName)
      .replace(/database_id = ""[^\n]*/, `database_id = "${randomUUID()}"`);
    writeFileSync(path.join(dir, "wrangler.toml"), wrangler);
    writeFileSync(
      path.join(dir, "src/cms/adapters/db.ts"),
      'export * from "@kidecms/core/platform/cloudflare/database";\n',
    );
    writeFileSync(
      path.join(dir, "src/cms/adapters/storage.ts"),
      'export * from "@kidecms/core/platform/cloudflare/storage";\n',
    );
    rmSync(path.join(dir, "src/cms/adapters/__tests__"), { recursive: true, force: true });
  }
  if (starter) {
    // The starter's content model and seed are host-independent; its pages and blocks
    // come from the Svelte port in starters/sveltekit/.
    console.log(`[sveltekit-verify] applying the "${starter}" starter`);
    cpSync(path.join(root, "starters", starter, "src/cms"), path.join(dir, "src/cms"), { recursive: true });
    cpSync(path.join(root, "starters/sveltekit", starter), dir, { recursive: true });
  }
  rmSync(path.join(dir, "adapters"), { recursive: true, force: true });

  const pkgPath = path.join(dir, "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  if (packageMode) {
    // Mirrors create-kide-app's package mode: the runtime comes from the published artifact.
    const packDir = mkdtempSync(path.join(tmpdir(), "kide-sveltekit-pack-"));
    const tarball = execSync(`pnpm --filter @kidecms/core pack --pack-destination ${packDir}`, {
      cwd: root,
      encoding: "utf-8",
    })
      .trim()
      .split("\n")
      .pop();
    for (const managed of MANAGED) rmSync(path.join(dir, "src/cms", managed), { recursive: true, force: true });
    rmSync(path.join(dir, "src/cms/package.json"), { force: true });
    rmSync(path.join(dir, "pnpm-workspace.yaml"), { force: true });
    rmSync(path.join(dir, "vitest.workers.config.ts"), { force: true });
    rmSync(path.join(dir, "scripts/generate-test-fixtures.ts"), { force: true });
    pkg.dependencies["@kidecms/core"] = `file:${tarball}`;
    delete pkg.scripts["test:fixtures"];
  }
  const patches = ["adapters/sveltekit/package.patch.json"];
  if (cloudflare) patches.push("adapters/sveltekit/cloudflare/package.patch.json");
  for (const file of patches) {
    const patch = JSON.parse(readFileSync(path.join(root, file), "utf8"));
    for (const section of ["dependencies", "devDependencies"]) {
      for (const name of patch[section]?.remove ?? []) delete pkg[section][name];
      Object.assign(pkg[section], patch[section]?.add ?? {});
    }
    for (const name of patch.devDependencies?.moveFromDependencies ?? []) {
      if (!pkg.dependencies[name]) continue;
      pkg.devDependencies[name] = pkg.dependencies[name];
      delete pkg.dependencies[name];
    }
    Object.assign(pkg.scripts, patch.scripts);
    for (const name of patch.removeScripts ?? []) delete pkg.scripts[name];
  }
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);

  console.log("[sveltekit-verify] installing, checking, building");
  // --no-frozen-lockfile: the dep swap above diverges from the lockfile; CI defaults to frozen
  run("pnpm install --prefer-offline --no-frozen-lockfile");
  run("pnpm cms:generate");
  // The template ships no migration history — generate the baseline like create-kide-app does.
  if (cloudflare) run("pnpm exec drizzle-kit generate");
  run("pnpm check");
  // The scaffold's formatter must load its plugins, and shipped files must already be formatted.
  run("pnpm format:check");
  run("pnpm build");
  run("git init -q");
  for (const output of [".svelte-kit", "build"]) {
    if (!existsSync(path.join(dir, output))) continue;
    try {
      execSync(`git check-ignore -q ${output}`, { cwd: dir });
    } catch {
      throw new Error(`${output}/ is not gitignored`);
    }
  }
  console.log("[sveltekit-verify] ✓ check + build clean");

  if (cloudflare) {
    run(`pnpm exec wrangler d1 migrations apply ${projectName}-db --local`);
    // Production builds refuse to sign admin sessions without a secret.
    writeFileSync(
      path.join(dir, ".dev.vars"),
      "KIDE_AUTH_SECRET=verify-only-secret-0123456789abcdef\nCRON_SECRET=verify-only-cron\n",
    );
  } else {
    run("pnpm cms:push");
  }
  if (starter) run("pnpm cms:seed");
  console.log(
    `[sveltekit-verify] booting the ${cloudflare ? "Worker (wrangler dev)" : "Node server"} and driving real requests`,
  );
  await bootAndProbe(dir);
  console.log(`\n[sveltekit-verify] ✓ SvelteKit (${target}) target builds AND serves the admin, API and site`);
} finally {
  if (!process.env.KEEP) rmSync(dir, { recursive: true, force: true });
}

async function bootAndProbe(dir) {
  const port = 18788;
  const base = `http://127.0.0.1:${port}`;
  // adapter-node assumes https for the request origin unless paths.origin is configured
  // (a TLS proxy normally sits in front), so same-origin requests must claim that origin.
  // The Worker takes the origin from the request URL itself.
  const origin = cloudflare ? base : `https://127.0.0.1:${port}`;
  const child = cloudflare
    ? spawn("pnpm", ["exec", "wrangler", "dev", "--port", String(port), "--local", "--test-scheduled"], {
        cwd: dir,
        stdio: ["ignore", "pipe", "pipe"],
      })
    : spawn("node", ["server.js"], {
        cwd: dir,
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...process.env,
          PORT: String(port),
          KIDE_AUTH_SECRET: "verify-only-secret-0123456789abcdef",
          CRON_SECRET: "verify-only-cron",
        },
      });
  let output = "";
  child.stdout.on("data", (d) => (output += d));
  child.stderr.on("data", (d) => (output += d));

  try {
    await waitForServer(base, cloudflare ? 90_000 : 30_000);

    const notReady = await fetch(`${base}/admin`, { redirect: "manual" });
    assert(notReady.status === 302 || notReady.status === 303, `GET /admin (no user) → ${notReady.status}`);

    const setupRes = await fetch(`${base}/api/cms/auth/setup`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: origin },
      body: new URLSearchParams({
        name: "Verify Admin",
        email: "verify@example.com",
        password: "verify-sveltekit-password",
        confirmPassword: "verify-sveltekit-password",
      }),
      redirect: "manual",
    });
    assert(setupRes.status < 500, `POST /api/cms/auth/setup → ${setupRes.status} ${await safeText(setupRes)}`);
    const cookie = setupRes.headers.get("set-cookie");
    assert(cookie, `setup did not return a session cookie (status ${setupRes.status}) ${await safeText(setupRes)}`);
    const authed = (init = {}) => ({
      ...init,
      headers: { cookie, Origin: origin, ...init.headers },
      redirect: "manual",
    });

    // Malformed paths must not slip past the auth check (anonymous, after setup).
    for (const pathname of ["//admin/recent", "/admin//recent", "/api//cms/assets", "//api/cms/assets"]) {
      const res = await fetch(`${base}${pathname}`, { redirect: "manual" });
      const body = await safeText(res);
      assert(
        res.status !== 200 || !/kide-island|kide-app|"items"/.test(body),
        `anonymous GET ${pathname} → ${res.status}, served Kide content`,
      );
    }

    const recent = await fetch(`${base}/admin/recent`, authed());
    const recentHtml = await safeText(recent);
    assert(recent.status === 200, `GET /admin/recent → ${recent.status}\n${recentHtml.slice(0, 500)}`);
    assert(recentHtml.includes('id="kide-app"'), "admin page rendered no app root");
    // In-app navigation: the same URL answers with the page's data instead of a document.
    const recentData = await fetch(`${base}/admin/recent`, {
      headers: { ...authed().headers, "x-kide-nav": "1" },
    });
    const recentPayload = await recentData.json().catch(() => null);
    assert(recentPayload?.view?.kind === "recent", `in-app GET /admin/recent → ${JSON.stringify(recentPayload)}`);
    const script = recentHtml.match(/src="(\/_kide\/admin\.js\?v=[^"]+)"/)?.[1];
    const style = recentHtml.match(/href="(\/_kide\/admin\.css\?v=[^"]+)"/)?.[1];
    assert(script && style, "admin page does not link the /_kide bundle");
    for (const asset of [script, style]) {
      const res = await fetch(`${base}${asset}`);
      assert(res.status === 200, `GET ${asset} → ${res.status}`);
    }

    for (const page of ["/admin/pages", "/admin/pages/new", "/admin/assets", "/admin/account", "/admin/users"]) {
      const res = await fetch(`${base}${page}`, authed());
      assert(res.status === 200, `GET ${page} → ${res.status}\n${(await safeText(res)).slice(0, 500)}`);
    }

    // A realistic size: the Node adapter's default body limit (512K) would reject it.
    const png = new Uint8Array(2 * 1024 * 1024);
    png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const form = new FormData();
    form.set("file", new Blob([png], { type: "image/png" }), "probe.png");
    const uploadRes = await fetch(`${base}/api/cms/assets/upload`, authed({ method: "POST", body: form }));
    const uploadBody = await safeText(uploadRes);
    assert(uploadRes.status < 400, `POST /api/cms/assets/upload → ${uploadRes.status}\n${uploadBody.slice(0, 500)}`);
    const { storagePath } = JSON.parse(uploadBody);
    const served = await fetch(`${base}${storagePath}`);
    assert(served.status === 200, `GET ${storagePath} → ${served.status}`);

    const body = {
      type: "root",
      children: [{ type: "paragraph", children: [{ type: "text", value: "Rendered by SvelteKit" }] }],
    };
    const created = await fetch(
      `${base}/api/cms/pages`,
      authed({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Verify page", slug: "verify-page", body }),
      }),
    );
    const createdBody = await safeText(created);
    assert(created.status < 400, `POST /api/cms/pages → ${created.status}\n${createdBody.slice(0, 500)}`);
    const { _id } = JSON.parse(createdBody);
    const published = await fetch(`${base}/api/cms/pages/${_id}/publish`, authed({ method: "POST" }));
    assert(published.status < 400, `publish → ${published.status} ${await safeText(published)}`);

    const site = await fetch(`${base}/verify-page`);
    const siteHtml = await safeText(site);
    assert(site.status === 200 && siteHtml.includes("Rendered by SvelteKit"), `GET /verify-page → ${site.status}`);
    const home = await fetch(`${base}/`);
    assert(home.status === 200, `GET / → ${home.status}`);

    const preview = await fetch(
      `${base}/api/cms/preview/render`,
      authed({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "content", data: body }),
      }),
    );
    const previewHtml = await safeText(preview);
    assert(
      preview.status === 200 && previewHtml.includes("Rendered by SvelteKit") && previewHtml.includes("cms-content"),
      `POST /api/cms/preview/render → ${preview.status}\n${previewHtml.slice(0, 500)}`,
    );
    if (starter === "marketing") {
      for (const [pathname, expected] of [
        ["/", 'data-cms="blocks"'],
        ["/blog", "/blog/"],
        ["/contact", "/api/cms/forms/submit/contact"],
      ]) {
        const res = await fetch(`${base}${pathname}`);
        const html = await safeText(res);
        assert(res.status === 200 && html.includes(expected), `GET ${pathname} → ${res.status}, missing ${expected}`);
        if (pathname === "/blog") {
          const post = html.match(/href="(\/blog\/[^"]+)"/)?.[1];
          assert(post, "blog index lists no posts");
          const postRes = await fetch(`${base}${post}`);
          assert(postRes.status === 200, `GET ${post} → ${postRes.status}`);
        }
      }
    }

    if (cloudflare) {
      // wrangler's --test-scheduled route fires the cron handler the build patched in.
      const scheduled = await fetch(`${base}/__scheduled?cron=*+*+*+*+*`);
      assert(scheduled.status === 200, `GET /__scheduled → ${scheduled.status}`);
      await new Promise((r) => setTimeout(r, 1000));
      assert(output.includes("Cron /api/cms/cron/publish:"), "the cron trigger did not reach /api/cms/cron/publish");
    }

    // SvelteKit's CSRF check runs before any hook and rejects a cross-site POST that has no
    // Content-Type, so schedulers use GET or a JSON POST (see the README).
    for (const init of [{}, { method: "POST", headers: { "Content-Type": "application/json" } }]) {
      const res = await fetch(`${base}/api/cms/cron/tasks`, {
        ...init,
        headers: { Authorization: "Bearer verify-only-cron", ...init.headers },
      });
      assert(res.status === 200, `${init.method ?? "GET"} /api/cms/cron/tasks → ${res.status} ${await safeText(res)}`);
    }

    const anonymousPreview = await fetch(`${base}/api/cms/preview/render`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: origin },
      body: JSON.stringify({ type: "content", data: body }),
    });
    assert(anonymousPreview.status === 401, `anonymous preview render → ${anonymousPreview.status}, expected 401`);
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
        await new Promise((r) => setTimeout(r, 300));
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
