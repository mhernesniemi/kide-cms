#!/usr/bin/env node
// Assembles a project from HEAD for each starter in starters/ (barebone base +
// overlay, embedded shape), then checks, pushes a temp schema, seeds with
// row-count verification, and builds. Also rejects overlay files outside the
// allowlist in starters/README.md. Run: pnpm verify:starters
import { execSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const root = process.cwd();
const startersDir = path.join(root, "starters");

const ALLOWED = [
  /^starter\.json$/,
  /^src\/cms\/cms\.config\.ts$/,
  /^src\/cms\/seed\.ts$/,
  /^src\/cms\/collections\//,
  /^src\/pages\//,
  /^src\/components\//,
  /^src\/layouts\//,
  /^src\/styles\//,
];

const listFiles = (dir, base = dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listFiles(full, base);
    return entry.name === ".DS_Store" ? [] : [path.relative(base, full)];
  });

const SEED_COUNT_SCRIPT = `import Database from "better-sqlite3";
import seedData from "../src/cms/seed.ts";

const db = new Database("data/cms.db", { readonly: true });
for (const [slug, docs] of Object.entries(seedData)) {
  const table = \`cms_\${slug.replace(/-/g, "_")}\`;
  const row = db.prepare(\`SELECT COUNT(*) AS n FROM \${table}\`).get() as { n: number };
  if (row.n < docs.length) {
    console.error(\`\${table}: \${row.n} rows, expected at least \${docs.length}\`);
    process.exit(1);
  }
  console.log(\`\${table}: \${row.n} rows\`);
}
db.close();
`;

const starters = existsSync(startersDir)
  ? readdirSync(startersDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
  : [];

if (starters.length === 0) {
  console.log("[starters-verify] no starters found — nothing to verify");
  process.exit(0);
}

for (const starter of starters) {
  const starterRoot = path.join(startersDir, starter);

  // The CLI silently skips starters with a broken manifest — fail the gate instead.
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(path.join(starterRoot, "starter.json"), "utf8"));
  } catch (error) {
    console.error(`[starters-verify] "${starter}" has invalid starter.json: ${error.message}`);
    process.exit(1);
  }
  if (
    manifest.name !== starter ||
    typeof manifest.label !== "string" ||
    typeof manifest.hint !== "string" ||
    typeof manifest.order !== "number"
  ) {
    console.error(
      `[starters-verify] "${starter}" starter.json needs name (matching the directory), label, hint, order`,
    );
    process.exit(1);
  }

  const forbidden = listFiles(starterRoot).filter((file) => !ALLOWED.some((pattern) => pattern.test(file)));
  if (forbidden.length > 0) {
    console.error(
      `[starters-verify] "${starter}" ships files outside the overlay allowlist:\n  ${forbidden.join("\n  ")}`,
    );
    process.exit(1);
  }

  const dir = mkdtempSync(path.join(tmpdir(), `kide-starter-${starter}-`));
  const project = path.join(dir, "app");
  const run = (cmd) => execSync(cmd, { cwd: project, stdio: "inherit" });

  try {
    console.log(`\n[starters-verify] assembling "${starter}" in ${project}`);
    cpSync(root, project, {
      recursive: true,
      filter: (src) =>
        !/(^|\/)(node_modules|\.git|dist|\.astro|\.wrangler|\.cms-cache|data|starters)(\/|$)/.test(src) &&
        src !== path.join(root, "src/cms/.generated"),
    });
    cpSync(starterRoot, project, { recursive: true });
    rmSync(path.join(project, "starter.json"), { force: true });
    rmSync(path.join(project, "adapters"), { recursive: true, force: true });

    run("pnpm install --prefer-offline --no-frozen-lockfile");
    run("pnpm cms:generate");
    run("pnpm check"); // starter sources are excluded from the root check — typed and linted here
    run("pnpm cms:push");
    run("pnpm exec kide seed");
    if (existsSync(path.join(project, "src/cms/seed.ts"))) {
      writeFileSync(path.join(project, "scripts/starter-seed-counts.mts"), SEED_COUNT_SCRIPT);
      run("node --import tsx scripts/starter-seed-counts.mts");
    }
    run("pnpm exec astro build");
    console.log(`[starters-verify] ✓ "${starter}" checks, seeds, and builds`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log(`\n[starters-verify] ✓ ${starters.length} starter(s) verified`);
