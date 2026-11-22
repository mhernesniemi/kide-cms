/**
 * Mapping-driven content import (WordPress for now).
 *
 *   kide-wp scout <dump.sql[.gz]> [--uploads <wp-content/uploads dir>] [--media-base <url>] [--site-url <url>] [--prefix wp_]
 *   kide-wp sample <type> [--id <n>] [--n 2] [--full]
 *   kide-wp plan [--only <type,type>] [--show <id|key>] [--min-recall 0.95]
 *   kide-wp apply [--all] [--force] [--no-prune] [--concurrency 12]
 *   kide-wp verify [--min-recall 0.95]
 *   kide-wp check-live [--base <url>] [--min-score 0.9] [--concurrency 6] [--limit N] [--refresh]
 *
 * Mappings live in migration/*.map.ts. Outputs go to .kide/import/.
 */
import { readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { applyImport } from "./apply";
import { checkLive, liveScore, renderLive } from "./live";
import { truncate } from "./domain";
import { loadMappings, planImport } from "./plan";
import { buildProfile, renderProfile } from "./profile";
import { renderLedger, savePlan } from "./report";
import { getMeta, importDir, loadMedia, loadRecords, openStaging } from "./staging";
import { verifyImport } from "./verify";
import { scoutWordPress } from "./wordpress";
import { loadProjectConfig, loadProjectRuntime } from "@kidecms/core/internals/project.ts";

// Per-document audit lines would bury the report on a real site.
process.env.CMS_LOG_LEVEL ??= "warn";

const USAGE = `Usage: kide-wp <command>  (playbook: MIGRATING.md)

  scout <dump.sql[.gz]> [--uploads <dir>] [--site-url <url>] [--media-base <url>] [--prefix wp_]
  sample <type> [--id <n>] [--n 2] [--full]       staged records of a source type
  plan [--only <type,…>] [--show <id|key>] [--min-recall 0.95]
  apply [--all] [--force] [--no-prune] [--concurrency 12]
  verify [--min-recall 0.95]
  check-live [--base <url>] [--min-score 0.9] [--concurrency 6] [--limit N] [--refresh]

Mappings: migration/*.map.ts · reports: .kide/import/{profile,ledger,verify,live}.md`;

const [command, ...args] = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
// Every subcommand writes or fetches something, so asking for help must never run one.
if (args.includes("--help") || args.includes("-h")) {
  console.log(USAGE);
  process.exit(0);
}
const option = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const positional = args.filter((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"));
const out = (file: string) => path.relative(process.cwd(), path.join(importDir(), file));
const fail = (message: string): never => {
  console.error(`[kide-wp] ${message}`);
  process.exit(1);
};

const staging = openStaging();

const shorten = (value: unknown, full: boolean): unknown => {
  if (full) return value;
  if (typeof value === "string") return value.length > 400 ? `${value.slice(0, 400)}… (${value.length} chars)` : value;
  if (Array.isArray(value)) return value.map((v) => shorten(v, full));
  if (value && typeof value === "object")
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, shorten(v, full)]));
  return value;
};

try {
  switch (command) {
    case "scout": {
      const dump = positional[0] ?? fail("usage: kide-wp scout <dump.sql[.gz]> [--uploads <dir>]");
      const started = Date.now();
      let uploads = option("uploads") ? path.resolve(option("uploads")!) : undefined;
      // A Bedrock checkout has an empty uploads folder (just .gitkeep): download from the site instead.
      if (
        uploads &&
        !readdirSync(uploads, { recursive: true }).some((f) => !String(f).split("/").pop()!.startsWith("."))
      ) {
        console.log(`[kide-wp] ${uploads} holds no files — media will be downloaded from the site on apply.`);
        uploads = undefined;
      }
      const summary = await scoutWordPress(staging, path.resolve(dump), {
        prefix: option("prefix"),
        uploadsDir: uploads,
        mediaBaseUrl: option("media-base"),
        siteUrl: option("site-url"),
      });
      const meta = Object.fromEntries(
        ["source", "siteUrl", "prefix", "uploadsUrl", "uploadsDir", "scoutedAt"].map((k) => [k, getMeta(staging, k)]),
      );
      const records = loadRecords(staging);
      const profile = buildProfile(records);
      writeFileSync(path.join(importDir(), "profile.md"), renderProfile(meta, profile, loadMedia(staging)));
      writeFileSync(path.join(importDir(), "profile.json"), JSON.stringify({ meta, types: profile }, null, 2));
      console.log(
        `[kide-wp] Staged ${summary.records} records + ${summary.media} media from ${summary.siteUrl || dump} (prefix ${summary.prefix}) in ${Date.now() - started}ms.`,
      );
      for (const [type, n] of Object.entries(summary.types).sort((a, b) => b[1] - a[1]))
        console.log(`  ${type.padEnd(28)} ${n}`);
      console.log(`Read ${out("profile.md")}, then write migration/<type>.map.ts and run \`kide-wp plan\`.`);
      break;
    }

    case "sample": {
      const type = positional[0] ?? fail("usage: kide-wp sample <type> [--id <n>] [--n 2] [--full]");
      const id = option("id");
      const n = Number(option("n") ?? 2);
      const list = loadRecords(staging).filter((r) => r.type === type && (!id || String(r.id) === id));
      if (!list.length) fail(`no staged records for ${type}${id ? ` with id ${id}` : ""}`);
      console.log(JSON.stringify(shorten(list.slice(0, id ? 1 : n), flag("full")), null, 2));
      break;
    }

    case "plan": {
      await loadProjectRuntime();
      const config = await loadProjectConfig();
      const only = option("only")?.split(",");
      const plan = await planImport(staging, config, await loadMappings(), {
        minRecall: option("min-recall") ? Number(option("min-recall")) : undefined,
        only,
      });
      const show = option("show");
      if (show) {
        const key = /^\d+$/.test(show) ? `post:${show}` : show;
        const doc = plan.docs.find((d) => d.sourceKeys.includes(key) || d.docId === show);
        const issues = plan.ledgers.flatMap((l) => l.issues.filter((i) => i.key === key));
        console.log(JSON.stringify({ doc: doc && { ...doc, expected: undefined }, issues }, null, 2));
        break;
      }
      writeFileSync(path.join(importDir(), "ledger.md"), renderLedger(plan));
      if (!only) savePlan(staging, plan);
      const totals = plan.ledgers.map((l) => {
        if (l.skip) return `  ${l.source.padEnd(24)} skipped — ${truncate(l.skip, 60)}`;
        const open = l.paths.filter((p) => p.status === "unaccounted").length;
        const issues = l.issues.filter((i) => i.kind !== "warning").length;
        return `  ${l.source.padEnd(24)} → ${String(l.collection).padEnd(16)} ${String(l.docs).padStart(5)} docs · ${open} unaccounted · ${issues} issues · recall min ${(l.recall.min * 100).toFixed(1)}%`;
      });
      console.log(`[kide-wp] Planned ${plan.docs.length} documents in ${plan.durationMs}ms.`);
      console.log(totals.join("\n"));
      if (plan.blocking.length) {
        console.log(`\nBLOCKED (${plan.blocking.length}) — details in ${out("ledger.md")}:`);
        for (const b of plan.blocking.slice(0, 30)) console.log(`  - ${b}`);
        process.exitCode = 1;
      } else {
        console.log(
          `\nREADY${only ? " (partial plan, not saved — run without --only to apply)" : ""}. Ledger: ${out("ledger.md")}`,
        );
      }
      break;
    }

    case "apply": {
      const r = await applyImport(staging, {
        force: flag("force"),
        all: flag("all"),
        prune: !flag("no-prune"),
        concurrency: option("concurrency") ? Number(option("concurrency")) : undefined,
      });
      console.log(
        `[kide-wp] ${r.created} created · ${r.updated} updated · ${r.unchanged} unchanged · ${r.deleted} deleted · media ${r.media.uploaded} uploaded, ${r.media.reused} reused · ${r.durationMs}ms`,
      );
      if (r.media.missing.length)
        console.log(`  ${r.media.missing.length} file(s) missing at the source (4xx), their references dropped:`);
      for (const f of r.media.missing.slice(0, 20)) console.log(`    ${f.key} — ${f.message}`);
      for (const f of r.media.failed.slice(0, 20)) console.log(`  media failed: ${f.key} — ${f.message}`);
      for (const f of r.failed.slice(0, 20)) console.log(`  failed: ${f.docId} — ${f.message}`);
      if (r.failed.length || r.media.failed.length) process.exitCode = 1;
      else console.log("Run `kide-wp verify` to reconcile the CMS against the plan.");
      break;
    }

    case "verify": {
      const r = await verifyImport(staging, {
        minRecall: option("min-recall") ? Number(option("min-recall")) : undefined,
      });
      for (const [slug, s] of Object.entries(r.byCollection))
        console.log(`  ${slug.padEnd(20)} ${s.found}/${s.planned} documents · ${s.translations} translations`);
      const lines = r.problems.map((p) => `- \`${p.collection}/${p.docId}\` ${p.message}`);
      writeFileSync(
        path.join(importDir(), "verify.md"),
        `# Verify\n\n${r.ok}/${r.checked} documents match the plan.\n\n${lines.join("\n")}\n`,
      );
      console.log(`[kide-wp] ${r.ok}/${r.checked} documents match the plan.`);
      for (const l of lines.slice(0, 30)) console.log(`  ${l}`);
      if (r.problems.length) process.exitCode = 1;
      break;
    }

    case "check-live": {
      const minScore = Number(option("min-score") ?? 0.9);
      const started = Date.now();
      const r = await checkLive(staging, {
        baseUrl: option("base"),
        concurrency: option("concurrency") ? Number(option("concurrency")) : undefined,
        limit: option("limit") ? Number(option("limit")) : undefined,
        refresh: flag("refresh"),
      });
      writeFileSync(path.join(importDir(), "live.md"), renderLive(r, minScore));
      const score = liveScore;
      const ok = r.pages.filter((p) => p.status === 200);
      const below = ok.filter((p) => score(p) < minScore);
      const mean = ok.length ? ok.reduce((a, p) => a + score(p), 0) / ok.length : 1;
      console.log(
        `[kide-wp] ${r.pages.length} live pages in ${Date.now() - started}ms · mean ${(mean * 100).toFixed(1)}% · ${below.length} below ${(minScore * 100).toFixed(0)}% · ${ok.filter((p) => p.skipped.length).length} show skipped-source text · ${ok.filter((p) => p.drift.length).length} with text not in the dump · ${r.pages.length - ok.length} not 200 · ${r.failed.length} failed`,
      );
      console.log(`Details: ${out("live.md")}`);
      if (below.length || r.failed.length) process.exitCode = 1;
      break;
    }

    default:
      console.log(USAGE);
      process.exitCode = command ? 1 : 0;
  }
} catch (e) {
  fail((e as Error).message);
} finally {
  staging.close();
}
