/**
 * Mapping-driven content import (WordPress for now).
 *
 *   kide import scout <dump.sql[.gz]> [--uploads <wp-content/uploads dir>] [--media-base <url>] [--site-url <url>] [--prefix wp_]
 *   kide import sample <type> [--id <n>] [--n 2] [--full]
 *   kide import plan [--only <type,type>] [--show <id|key>] [--min-recall 0.95]
 *   kide import apply [--all] [--force] [--no-prune] [--concurrency 6]
 *   kide import verify [--min-recall 0.95]
 *   kide import check-live [--base <url>] [--min-score 0.9] [--concurrency 6] [--limit N] [--refresh]
 *
 * Mappings live in migration/*.map.ts. Outputs go to .kide/import/.
 */
import { writeFileSync } from "node:fs";
import path from "node:path";

import { applyImport } from "../core/importer/apply";
import { checkLive, liveScore, renderLive } from "../core/importer/live";
import { truncate } from "../core/importer/domain";
import { loadMappings, planImport } from "../core/importer/plan";
import { buildProfile, renderProfile } from "../core/importer/profile";
import { renderLedger, savePlan } from "../core/importer/report";
import { getMeta, importDir, loadMedia, loadRecords, openStaging } from "../core/importer/staging";
import { verifyImport } from "../core/importer/verify";
import { scoutWordPress } from "../core/importer/wordpress";
import { loadProjectConfig, loadProjectRuntime } from "./project";

// Per-document audit lines would bury the report on a real site.
process.env.CMS_LOG_LEVEL ??= "warn";

const [command, ...args] = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const option = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const positional = args.filter((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"));
const out = (file: string) => path.relative(process.cwd(), path.join(importDir(), file));
const fail = (message: string): never => {
  console.error(`[kide import] ${message}`);
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
      const dump = positional[0] ?? fail("usage: kide import scout <dump.sql[.gz]> [--uploads <dir>]");
      const started = Date.now();
      const summary = await scoutWordPress(staging, path.resolve(dump), {
        prefix: option("prefix"),
        uploadsDir: option("uploads") ? path.resolve(option("uploads")!) : undefined,
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
        `[kide import] Staged ${summary.records} records + ${summary.media} media from ${summary.siteUrl || dump} (prefix ${summary.prefix}) in ${Date.now() - started}ms.`,
      );
      for (const [type, n] of Object.entries(summary.types).sort((a, b) => b[1] - a[1]))
        console.log(`  ${type.padEnd(28)} ${n}`);
      console.log(`Read ${out("profile.md")}, then write migration/<type>.map.ts and run \`kide import plan\`.`);
      break;
    }

    case "sample": {
      const type = positional[0] ?? fail("usage: kide import sample <type> [--id <n>] [--n 2]");
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
      console.log(`[kide import] Planned ${plan.docs.length} documents in ${plan.durationMs}ms.`);
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
        `[kide import] ${r.created} created · ${r.updated} updated · ${r.unchanged} unchanged · ${r.deleted} deleted · media ${r.media.uploaded} uploaded, ${r.media.reused} reused · ${r.durationMs}ms`,
      );
      for (const f of r.media.failed.slice(0, 20)) console.log(`  media failed: ${f.key} — ${f.message}`);
      for (const f of r.failed.slice(0, 20)) console.log(`  failed: ${f.docId} — ${f.message}`);
      if (r.failed.length || r.media.failed.length) process.exitCode = 1;
      else console.log("Run `kide import verify` to reconcile the CMS against the plan.");
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
      console.log(`[kide import] ${r.ok}/${r.checked} documents match the plan.`);
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
        `[kide import] ${r.pages.length} live pages in ${Date.now() - started}ms · mean ${(mean * 100).toFixed(1)}% · ${below.length} below ${(minScore * 100).toFixed(0)}% · ${ok.filter((p) => p.skipped.length).length} show skipped-source text · ${ok.filter((p) => p.drift.length).length} drifted · ${r.pages.length - ok.length} not 200 · ${r.failed.length} failed`,
      );
      console.log(`Details: ${out("live.md")}`);
      if (below.length || r.failed.length) process.exitCode = 1;
      break;
    }

    default:
      console.log("Usage: kide import <scout|sample|plan|apply|verify|check-live> — see src/cms/internals/import.ts");
      process.exitCode = command ? 1 : 0;
  }
} catch (e) {
  fail((e as Error).message);
} finally {
  staging.close();
}
