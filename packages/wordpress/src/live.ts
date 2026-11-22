/**
 * `kide-wp check-live`: the rendered source site is the judge. Every planned document with a
 * WordPress permalink is fetched from the live site; its visible content blocks must be found in
 * the Kide document. Catches content a theme renders from somewhere the database checks can't
 * see (template fields, options pages, widgets). Text shared by many pages (navigation, footer,
 * cookie banners) and text of other imported documents (listings, teasers) is reported apart.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

import { decodeEntities } from "@kidecms/core";
import { htmlText, outputStrings, words } from "./domain";
import { parseBlocks, walkBlocks } from "./gutenberg";
import { loadPlan } from "./report";
import { getMeta, loadRecords, type Staging } from "./staging";

export type LivePage = {
  url: string;
  docId: string;
  collection: string;
  locale: string;
  status: number;
  blocks: number;
  found: number;
  listed: number;
  /** In this page's own source record but not in its Kide document: a real loss. */
  missing: string[];
  /** In another staged record that isn't migrated (skipped type, filtered record). */
  skipped: Array<{ text: string; source: string }>;
  /** Nowhere in the dump: rendered by a plugin, feed or template, or changed after the export. */
  drift: string[];
};

export type LiveReport = { pages: LivePage[]; boilerplate: number; failed: Array<{ url: string; message: string }> };

const BLOCK_SPLIT =
  /<\/?(?:p|h[1-6]|li|div|section|article|blockquote|td|th|figcaption|dd|dt|br|tr|ul|ol|figure|form|label|button|a)\b[^>]*>/gi;

/** Visible text blocks of the page's main content (falls back to body without header/nav/footer). */
export const contentBlocks = (html: string): string[] => {
  let body = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|template|iframe)\b[\s\S]*?<\/\1>/gi, " ");
  const main = /<main\b[^>]*>([\s\S]*?)<\/main>/i.exec(body);
  body = main ? main[1] : body.replace(/<(header|nav|footer|aside)\b[\s\S]*?<\/\1>/gi, " ");
  return body
    .split(BLOCK_SPLIT)
    .map((chunk) =>
      decodeEntities(chunk.replace(/<[^>]+>/g, " "))
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter((text) => words(text).length >= 4);
};

const key = (text: string) => words(text).join(" ");

/** A block is found when its words appear in order in the document text, or nearly all of them do. */
const contains = (haystack: string, bag: Map<string, number>, block: string) => {
  const k = key(block);
  if (haystack.includes(k)) return true;
  const ws = words(block);
  const need = new Map<string, number>();
  for (const w of ws) need.set(w, (need.get(w) ?? 0) + 1);
  let hit = 0;
  for (const [w, n] of need) hit += Math.min(n, bag.get(w) ?? 0);
  return hit / ws.length >= 0.9;
};

const pool = async <T>(items: T[], size: number, run: (item: T) => Promise<void>) => {
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (i < items.length) await run(items[i++]);
    }),
  );
};

export const checkLive = async (
  staging: Staging,
  options: { baseUrl?: string; concurrency?: number; limit?: number; refresh?: boolean } = {},
): Promise<LiveReport> => {
  const plan = loadPlan(staging);
  if (!plan) throw new Error("No plan yet — run `kide-wp plan` first.");
  const base = (options.baseUrl ?? getMeta(staging, "siteUrl") ?? "").replace(/\/$/, "");
  if (!base) throw new Error("No site URL — pass --base <https://site>.");
  const records = new Map(loadRecords(staging).map((r) => [r.key, r]));

  // Every staged record's visible text, to tell a real loss from drift or a skipped source.
  const recordText = (r: Record<string, unknown>): string => {
    const parts: string[] = [];
    for (const [k, v] of Object.entries(r)) {
      if (k === "content" && typeof v === "string") {
        parts.push(htmlText(v.replace(/<!--|-->/g, " ")));
        for (const b of walkBlocks(parseBlocks(v))) parts.push(...outputStrings(b.attrs).map(htmlText));
      } else parts.push(...outputStrings(v).map((t) => (/<[a-z]/i.test(t) ? htmlText(t) : t)));
    }
    return words(parts.join(" ")).join(" ");
  };
  const sourceKeys: string[] = [];
  const sourceOffsets: number[] = [];
  let sourceAll = "";
  for (const [k, r] of records) {
    sourceKeys.push(k);
    sourceOffsets.push(sourceAll.length);
    sourceAll += `${recordText(r)} \u0000 `;
  }
  const sourceOf = (k: string): string | undefined => {
    const at = sourceAll.indexOf(k);
    if (at < 0) return undefined;
    let lo = 0;
    let hi = sourceOffsets.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (sourceOffsets[mid] <= at) lo = mid;
      else hi = mid - 1;
    }
    return sourceKeys[lo];
  };
  const pageSource = new Map<string, string>();
  // Shared across projects and fresh runs like the media cache; `--refresh` refetches.
  const cacheDir = path.resolve(process.env.KIDE_LIVE_CACHE ?? path.join(homedir(), ".cache", "kide", "import-live"));
  mkdirSync(cacheDir, { recursive: true });

  type Target = { url: string; docId: string; collection: string; locale: string; text: string[]; refs: string[] };
  const docText = new Map(plan.docs.map((d) => [d.docId, outputStrings(d.data)]));
  const targets: Target[] = [];
  const known: string[] = [];
  for (const doc of plan.docs) {
    const baseLocale = String(doc.data._sourceLocale ?? "");
    for (const k of doc.sourceKeys) {
      const record = records.get(k);
      const locale = String(record?.locale ?? baseLocale);
      const fields =
        locale === baseLocale || !doc.translations[locale] ? doc.data : { ...doc.data, ...doc.translations[locale] };
      const text = outputStrings(fields);
      known.push(...text.filter((t) => words(t).length >= 4));
      if (record?.status !== "publish" || typeof record.permalink !== "string") continue;
      // Documents this page embeds or links (a form, liftups): their text renders on it too.
      const refs = [...new Set(outputStrings(fields).filter((s) => s !== doc.docId && docText.has(s)))];
      targets.push({
        url: `${base}${record.permalink}`,
        docId: doc.docId,
        collection: doc.collection,
        locale,
        text,
        refs,
      });
      pageSource.set(`${base}${record.permalink}`, k);
    }
  }
  const selected = options.limit ? targets.slice(0, options.limit) : targets;

  const fetched = new Map<string, { status: number; html: string }>();
  const failed: LiveReport["failed"] = [];
  await pool(selected, options.concurrency ?? 6, async (t) => {
    const file = path.join(cacheDir, `${createHash("sha1").update(t.url).digest("hex")}.json`);
    if (!options.refresh && existsSync(file)) {
      fetched.set(t.url, JSON.parse(readFileSync(file, "utf8")));
      return;
    }
    try {
      const res = await fetch(t.url, { redirect: "follow", signal: AbortSignal.timeout(30_000) });
      const entry = { status: res.status, html: res.ok ? await res.text() : "" };
      fetched.set(t.url, entry);
      writeFileSync(file, JSON.stringify(entry));
    } catch (e) {
      failed.push({ url: t.url, message: (e as Error).message });
    }
  });

  const pageBlocks = new Map<string, string[]>();
  const frequency = new Map<string, number>();
  for (const t of selected) {
    const entry = fetched.get(t.url);
    if (!entry?.html) continue;
    const blocks = [...new Set(contentBlocks(entry.html))];
    pageBlocks.set(t.url, blocks);
    for (const b of blocks) frequency.set(key(b), (frequency.get(key(b)) ?? 0) + 1);
  }
  const threshold = Math.max(3, Math.ceil(pageBlocks.size * 0.05));
  const boilerplate = new Set([...frequency].filter(([, n]) => n >= threshold).map(([k]) => k));
  const knownText = known.map(key).join(" \u0000 ");

  const pages: LivePage[] = [];
  for (const t of selected) {
    const entry = fetched.get(t.url);
    if (!entry) continue;
    const blocks = (pageBlocks.get(t.url) ?? []).filter((b) => !boilerplate.has(key(b)));
    const own = t.text.map(key).join(" \u0000 ");
    const bag = new Map<string, number>();
    for (const w of words(t.text.join(" "))) bag.set(w, (bag.get(w) ?? 0) + 1);
    const refText = t.refs.flatMap((id) => docText.get(id) ?? []);
    const refBag = new Map<string, number>();
    for (const w of words(refText.join(" "))) refBag.set(w, (refBag.get(w) ?? 0) + 1);
    const page: LivePage = {
      url: t.url,
      docId: t.docId,
      collection: t.collection,
      locale: t.locale,
      status: entry.status,
      blocks: blocks.length,
      found: 0,
      listed: 0,
      missing: [],
      skipped: [],
      drift: [],
    };
    for (const b of blocks) {
      if (contains(own, bag, b)) page.found++;
      else if (knownText.includes(key(b)) || (refBag.size && contains(refText.map(key).join(" "), refBag, b)))
        page.listed++;
      else {
        const from = sourceOf(key(b));
        if (!from) page.drift.push(b);
        else if (from === pageSource.get(t.url)) page.missing.push(b);
        else
          page.skipped.push({ text: b, source: `${records.get(from)?.type} ${from} (${records.get(from)?.status})` });
      }
    }
    pages.push(page);
  }
  return { pages, boilerplate: boilerplate.size, failed };
};

/** Share of the page's migratable content that reached Kide; drift and skipped sources don't count. */
export const liveScore = (p: LivePage) => {
  const scope = p.found + p.listed + p.missing.length;
  return scope ? (p.found + p.listed) / scope : 1;
};

export const renderLive = (report: LiveReport, minScore: number): string => {
  const score = liveScore;
  const byCollection = new Map<string, LivePage[]>();
  for (const p of report.pages) byCollection.set(p.collection, [...(byCollection.get(p.collection) ?? []), p]);
  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
  const below = report.pages.filter((p) => p.status === 200 && score(p) < minScore).sort((a, b) => score(a) - score(b));
  const lines = [
    "# Live check",
    "",
    `${report.pages.length} pages compared with the live site · ${report.boilerplate} boilerplate blocks ignored · ${below.length} below ${pct(minScore)}`,
    "",
    "Score = share of the page's source content found in its Kide document (or, for listings, in another imported document).",
    "Blocks missing from Kide are looked up in the dump: in the page's own record → **missing** (counts against the score);",
    "in another staged record that isn't migrated → **skipped source**; nowhere in the dump → **not in the dump** (rendered by a plugin, feed or template, or changed after the export).",
    "",
    "| collection | pages | mean score | below threshold | pages with skipped-source text | pages with text not in the dump | not 200 |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...[...byCollection].map(([c, ps]) => {
      const ok = ps.filter((p) => p.status === 200);
      const mean = ok.length ? ok.reduce((a, p) => a + score(p), 0) / ok.length : 1;
      return `| \`${c}\` | ${ps.length} | ${pct(mean)} | ${ok.filter((p) => score(p) < minScore).length} | ${ok.filter((p) => p.skipped.length).length} | ${ok.filter((p) => p.drift.length).length} | ${ps.length - ok.length} |`;
    }),
    "",
  ];
  for (const p of report.pages.filter((x) => x.status !== 200)) lines.push(`- HTTP ${p.status}: ${p.url}`);
  const cut = (t: string) => (t.length > 140 ? `${t.slice(0, 139)}…` : t);
  for (const p of below) {
    lines.push("", `## ${p.url} — ${pct(score(p))} (\`${p.collection}/${p.docId}\`, ${p.locale})`, "");
    for (const m of p.missing.slice(0, 8)) lines.push(`- missing: ${cut(m)}`);
  }
  const skippedBySource = new Map<string, Set<string>>();
  for (const p of report.pages)
    for (const s of p.skipped) {
      const type = s.source.split(" ")[0];
      skippedBySource.set(type, (skippedBySource.get(type) ?? new Set()).add(p.url));
    }
  if (skippedBySource.size) {
    lines.push("", "## Live text from sources that aren't migrated", "");
    for (const [type, urls] of skippedBySource)
      lines.push(`- \`${type}\` on ${urls.size} page(s), e.g. ${[...urls].slice(0, 3).join(", ")}`);
  }
  const drifted = report.pages.filter((p) => p.drift.length);
  if (drifted.length) {
    lines.push("", `## Not in the dump: ${drifted.length} page(s) show text the export doesn't contain`, "");
    for (const p of drifted) lines.push(`- ${p.url}: ${cut(p.drift[0])}`);
  }
  for (const f of report.failed) lines.push(`- fetch failed: ${f.url} — ${f.message}`);
  return `${lines.join("\n")}\n`;
};
