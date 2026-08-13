#!/usr/bin/env node
// Verifies the @kidecms/core publish manifest: only managed runtime files may
// ship, and the runtime's key entry points must all be present. Run: node scripts/verify-pack.mjs
import { execFileSync } from "node:child_process";
import path from "node:path";

const packageDir = path.join(process.cwd(), "src/cms");

const output = execFileSync("npm", ["pack", "--dry-run", "--json"], {
  cwd: packageDir,
  encoding: "utf-8",
  stdio: ["ignore", "pipe", "ignore"],
});
const [manifest] = JSON.parse(output);
const files = manifest.files.map((f) => f.path);

const allowedTopLevel = new Set(["admin", "client", "core", "internals", "middleware", "platform", "routes"]);
const allowedRootFiles = new Set(["package.json", "README.md", "LICENSE"]);

const leaked = files.filter((file) => {
  const [top] = file.split("/");
  if (file.includes("/")) return !allowedTopLevel.has(top);
  return !allowedRootFiles.has(file);
});

const forbidden = files.filter((file) =>
  /cms\.config|(^|\/)collections\/|(^|\/)adapters\/|\.generated|^runtime\.ts$|(^|\/)fields\/|(^|\/)migrations\/|__tests__|__snapshots__|\.test\.ts$/.test(
    file,
  ),
);

const required = [
  "package.json",
  "core/index.ts",
  "core/generator.ts",
  "internals/integration.ts",
  "internals/cli.mjs",
  "internals/project.ts",
  "internals/context.ts",
  "middleware/auth.ts",
  "client/preview.ts",
  "routes/admin/login.astro",
  "platform/node/database.ts",
  "platform/cloudflare/database.ts",
];
const missing = required.filter((file) => !files.includes(file));

if (leaked.length || forbidden.length || missing.length) {
  if (leaked.length) console.error(`[verify-pack] Unexpected files in tarball:\n  ${leaked.join("\n  ")}`);
  if (forbidden.length) console.error(`[verify-pack] Project-owned files leaked:\n  ${forbidden.join("\n  ")}`);
  if (missing.length) console.error(`[verify-pack] Required files missing:\n  ${missing.join("\n  ")}`);
  process.exit(1);
}

console.log(`[verify-pack] ✓ ${files.length} files, ${(manifest.size / 1024).toFixed(0)} kB — manifest clean`);
