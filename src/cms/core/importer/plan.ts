/**
 * `kide import plan`: run every mapping over the staged source and produce
 *   - the documents to write (validated, hashed, media as placeholder tokens),
 *   - a coverage ledger: every source path mapped, dropped with a reason, or unaccounted,
 *   - integrity checks: dangling refs, missing media, text recall per record.
 * Nothing touches the CMS database; `apply` writes what the plan stored.
 */
import { createHash } from "node:crypto";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  documentRoute,
  getTranslatableFieldNames,
  htmlToRichText,
  slugify,
  type CMSConfig,
  type CollectionConfig,
  type ContentNode,
  type RichTextNode,
} from "..";
import { validateDocument, validateTranslations } from "../migrate";
import {
  blockData,
  collectDomain,
  expandBlocks,
  htmlText,
  isCovered,
  matchesPath,
  outputStrings,
  textRecall,
  truncate,
} from "./domain";
import { autop, blockHtml, findShortcodes, replaceShortcodes, type ShortcodeHandler, type WpBlock } from "./gutenberg";
import {
  isSkip,
  Tracker,
  track,
  type BlockInput,
  type MapContext,
  type Mapping,
  type MappingModule,
  type SourceRecord,
  type Skip,
} from "./mapping";
import { reusableLookup } from "./profile";
import { termParts } from "./terms";
import { getMeta, loadMedia, loadRecords, type Staging, type StagedMedia, type StagedRecord } from "./staging";

/** Synthetic source type: one record per URL the plan changes, for redirect mappings. */
export const URL_CHANGES = "url-change";

export const MEDIA_PREFIX = "/uploads/.kide-media/";
export const MEDIA_TOKEN = /\/uploads\/\.kide-media\/([A-Za-z0-9_-]+)/g;
export const mediaToken = (key: string) => `${MEDIA_PREFIX}${Buffer.from(key).toString("base64url")}`;
export const tokenKey = (encoded: string) => Buffer.from(encoded, "base64url").toString("utf8");

const HTML_BLOCKS = new Set(
  [
    "paragraph",
    "heading",
    "list",
    "list-item",
    "quote",
    "pullquote",
    "image",
    "gallery",
    "preformatted",
    "verse",
    "code",
    "freeform",
    "buttons",
    "button",
    "file",
  ].map((n) => `core/${n}`),
);
const CONTAINER_BLOCKS = new Set(["group", "columns", "column", "row", "stack"].map((n) => `core/${n}`));
const EMPTY_BLOCKS = new Set(["spacer", "separator", "more", "nextpage"].map((n) => `core/${n}`));
const DEFAULT_SHORTCODES: Record<string, ShortcodeHandler> = {
  caption: (_, inner) => inner,
  embed: (_, inner) => inner,
};

export type IssueKind =
  | "invalid"
  | "shape"
  | "error"
  | "dangling-ref"
  | "missing-media"
  | "low-recall"
  | "duplicate-id"
  | "lost-translation"
  | "translation-advice"
  | "url-change"
  | "dangling-term"
  | "bundled-term"
  | "warning";
const BLOCKING: IssueKind[] = [
  "invalid",
  "shape",
  "error",
  "dangling-ref",
  "dangling-term",
  "bundled-term",
  "missing-media",
  "low-recall",
  "duplicate-id",
];

/** Compare URLs the way a visitor experiences them: decoded, NFC, no query and no trailing slash. */
export const normalizePath = (path: string): string => {
  let p = path.split(/[?#]/)[0];
  try {
    p = decodeURI(p);
  } catch {}
  p = p.normalize("NFC");
  if (p.length > 1) p = p.replace(/\/+$/, "");
  return p || "/";
};
/** Text editors translate; anything else (colour, image, date, relation) is usually the same in every language. */
const isTranslatedText = (field: { type: string; admin?: { component?: string } }) =>
  ["text", "slug", "richText", "content", "blocks"].includes(field.type)
    ? !(field.type === "text" && field.admin?.component)
    : ["taxonomy-terms", "menu-items"].includes(field.admin?.component ?? "");

export type Issue = { kind: IssueKind; key?: string; message: string };

export type PathStatus = {
  path: string;
  records: number;
  sample: string;
  status: "mapped" | "dropped" | "unaccounted";
  reason?: string;
};

export type SourceLedger = {
  source: string;
  collection?: string;
  skip?: string;
  records: number;
  filtered: Record<string, number>;
  docs: number;
  paths: PathStatus[];
  issues: Issue[];
  recall: { min: number; avg: number };
  staleDrops: string[];
};

export type PlannedDoc = {
  docId: string;
  collection: string;
  sourceKeys: string[];
  data: Record<string, unknown>;
  translations: Record<string, Record<string, unknown>>;
  /** Expected text per locale ("base" = the base row), for verify. */
  expected: Record<string, string[]>;
  media: string[];
  /** How verify compares text: the mapping's `textMatch`. */
  textMatch: "multiset" | "set";
  hash: string;
};

export type UrlChange = { key: string; collection: string; docId: string; from: string; to: string };

export type PlanResult = {
  urlChanges: UrlChange[];
  ledgers: SourceLedger[];
  unmapped: Array<{ type: string; records: number }>;
  docs: PlannedDoc[];
  media: Map<string, StagedMedia>;
  blocking: string[];
  durationMs: number;
};

export const mappingsDir = () =>
  path.resolve(process.env.KIDE_IMPORT_MAPPINGS ?? path.join(process.cwd(), "migration"));

export const loadMappings = async (dir = mappingsDir()): Promise<Array<Mapping | Skip>> => {
  if (!existsSync(dir)) return [];
  const files = readdirSync(dir)
    .filter((f) => /\.map\.(ts|mts|js|mjs)$/.test(f))
    .sort();
  const out: Array<Mapping | Skip> = [];
  for (const file of files) {
    const mod = (await import(pathToFileURL(path.join(dir, file)).href)).default as MappingModule;
    out.push(...(Array.isArray(mod) ? mod : [mod]));
  }
  const seen = new Map<string, number>();
  for (const m of out) seen.set(m.source, (seen.get(m.source) ?? 0) + 1);
  const dupes = [...seen].filter(([, n]) => n > 1).map(([s]) => s);
  if (dupes.length) throw new Error(`More than one mapping for source type(s): ${dupes.join(", ")}`);
  return out;
};

const sha = (value: unknown) => createHash("sha1").update(JSON.stringify(value)).digest("hex");

const firstDrop = (mapping: Mapping, p: string): [string, string] | undefined => {
  for (const [pattern, reason] of Object.entries(mapping.drop ?? {}))
    if (matchesPath(pattern, p)) return [pattern, reason];
  const contentDrop = (p.startsWith("block:") || p.startsWith("shortcode:")) && mapping.drop?.content;
  return contentDrop ? ["content", contentDrop] : undefined;
};

export const planImport = async (
  staging: Staging,
  config: CMSConfig,
  mappings: Array<Mapping | Skip>,
  options: { minRecall?: number; only?: string[] } = {},
): Promise<PlanResult> => {
  const started = Date.now();
  const minRecall = options.minRecall ?? 0.95;
  const records = loadRecords(staging);
  const mediaList = loadMedia(staging);
  const siteUrl = getMeta(staging, "siteUrl") ?? "";
  const uploadsUrl = getMeta(staging, "uploadsUrl") ?? `${siteUrl}/wp-content/uploads`;
  const uploadsDir = getMeta(staging, "uploadsDir");
  const uploadsPath = (() => {
    try {
      return new URL(uploadsUrl).pathname.replace(/\/$/, "");
    } catch {
      return "/wp-content/uploads";
    }
  })();
  const siteHosts = new Set(
    [siteUrl, uploadsUrl].flatMap((u) => {
      try {
        const host = new URL(u).host;
        return [host, host.startsWith("www.") ? host.slice(4) : `www.${host}`];
      } catch {
        return [];
      }
    }),
  );

  const reusable = reusableLookup(records);
  const byKey = new Map(records.map((r) => [r.key, r]));
  const byType = new Map<string, StagedRecord[]>();
  for (const r of records) {
    const list = byType.get(r.type);
    if (list) list.push(r);
    else byType.set(r.type, [r]);
  }
  const media = new Map(mediaList.map((m) => [m.key, m]));
  const byGroup = new Map<string, StagedRecord[]>();
  for (const r of records) {
    if (!r.group) continue;
    const members = byGroup.get(r.group);
    if (members) members.push(r);
    else byGroup.set(r.group, [r]);
  }
  const fileIndex = new Map(mediaList.filter((m) => m.file).map((m) => [m.file!, m.key]));
  const collections = new Map(config.collections.map((c) => [c.slug, c]));
  const defaultLocale = config.locales?.default;

  const active = mappings.filter((m) => !options.only || options.only.includes(m.source));
  const docIdByKey = new Map<string, string>();
  const collectionByType = new Map(
    mappings.filter((m): m is Mapping => !isSkip(m)).map((m) => [m.source, m.collection] as const),
  );
  const ledgers: SourceLedger[] = [];
  const docs: PlannedDoc[] = [];
  const urlChanges: UrlChange[] = [];
  const docLedger = new Map<string, SourceLedger>();

  // --- pass 1: filter, group translations, assign document ids -----------------
  type Prepared = { mapping: Mapping; collection: CollectionConfig; ledger: SourceLedger; groups: StagedRecord[][] };
  const prepared: Prepared[] = [];
  const allMappedIds = new Map<string, string>();
  for (const m of mappings) {
    if (isSkip(m)) continue;
    for (const r of byType.get(m.source) ?? []) {
      const verdict = m.filter ? m.filter(r) : true;
      if (verdict === true) allMappedIds.set(r.key, "");
    }
  }

  const prepareMapping = (m: Mapping | Skip) => {
    const list = byType.get(m.source) ?? [];
    const ledger: SourceLedger = {
      source: m.source,
      records: list.length,
      filtered: {},
      docs: 0,
      paths: [],
      issues: [],
      recall: { min: 1, avg: 1 },
      staleDrops: [],
    };
    ledgers.push(ledger);
    if (isSkip(m)) {
      ledger.skip = m.skip;
      return;
    }
    ledger.collection = m.collection;
    const collection = collections.get(m.collection);
    if (!collection) {
      ledger.issues.push({
        kind: "invalid",
        message: `unknown collection "${m.collection}" — declare it in cms.config.ts`,
      });
      return;
    }
    if (!list.length) ledger.issues.push({ kind: "warning", message: `no staged records of type "${m.source}"` });
    const kept: StagedRecord[] = [];
    for (const r of list) {
      const verdict = m.filter ? m.filter(r) : true;
      if (verdict === true) kept.push(r);
      else {
        const reason = typeof verdict === "string" ? verdict : "filtered";
        ledger.filtered[reason] = (ledger.filtered[reason] ?? 0) + 1;
      }
    }
    // Editors sometimes never link a page to its translation; one unlinked record per locale
    // sharing a slug is that pair.
    const unlinked = new Map<string, StagedRecord[]>();
    for (const r of kept)
      if (!r.group && r.locale && typeof r.slug === "string" && r.slug)
        unlinked.set(r.slug, [...(unlinked.get(r.slug) ?? []), r]);
    const pairedGroup = new Map<string, string>();
    for (const [slug, records] of unlinked) {
      const locales = new Set(records.map((r) => r.locale));
      if (records.length < 2 || locales.size !== records.length) continue;
      for (const r of records) pairedGroup.set(r.key, `paired:${slug}`);
      ledger.issues.push({
        kind: "warning",
        key: records[0].key,
        message: `${records.map((r) => r.key).join(" + ")} aren't linked as translations in the source but share the slug "${slug}"; imported as one document`,
      });
    }
    const grouped = new Map<string, StagedRecord[]>();
    for (const r of kept) {
      const g = r.group ?? pairedGroup.get(r.key) ?? r.key;
      const members = grouped.get(g);
      if (members) members.push(r);
      else grouped.set(g, [r]);
    }
    const groups = [...grouped.values()].map((members) => {
      members.sort((a, b) => a.id - b.id);
      // The original is the version written first (WordPress ids grow with time), not the
      // site's default language; synthetic records without real ids fall back to the default.
      const dated = members.every((x) => x.id > 0) && new Set(members.map((x) => x.id)).size === members.length;
      const base = dated ? members[0] : (members.find((x) => x.locale === defaultLocale) ?? members[0]);
      return [base, ...members.filter((x) => x !== base)];
    });
    for (const [base, ...rest] of groups) {
      const docId = m.id ? m.id(base) : base.key.startsWith("term:") ? `wp-term-${base.id}` : `wp-${base.id}`;
      for (const r of [base, ...rest]) docIdByKey.set(r.key, docId);
    }
    prepared.push({ mapping: m, collection, ledger, groups });
  };
  for (const m of active) if (m.source !== URL_CHANGES) prepareMapping(m);

  // Refs into mappings excluded by `--only` still resolve, so partial plans don't report false dangling refs.
  for (const m of mappings) {
    if (isSkip(m) || active.includes(m)) continue;
    for (const r of byType.get(m.source) ?? []) {
      if (!allMappedIds.has(r.key)) continue;
      docIdByKey.set(r.key, m.id ? m.id(r) : r.key.startsWith("term:") ? `wp-term-${r.id}` : `wp-${r.id}`);
    }
  }

  // --- media resolution ------------------------------------------------------
  const ensureMedia = (key: string, init: () => StagedMedia) => {
    if (!media.has(key)) media.set(key, init());
    return key;
  };
  const urlToMediaKey = (raw: string, allowExternal: boolean): string | null => {
    let u = raw.trim().split(/[?#]/)[0];
    if (u.startsWith("//")) u = `https:${u}`;
    const idx = u.indexOf(`${uploadsPath}/`);
    if (idx >= 0 && (u.startsWith("/") || siteHosts.has(hostOf(u)) || /\/wp-content\/uploads\//.test(u))) {
      const rel = decodeURIComponent(u.slice(idx + uploadsPath.length + 1));
      const stripped = rel.replace(/-\d+x\d+(\.\w+)$/, "$1");
      for (const candidate of [rel, stripped, stripped.replace(/-scaled(\.\w+)$/, "$1")]) {
        const key = fileIndex.get(candidate);
        if (key) return key;
      }
      return ensureMedia(`file:${rel}`, () => ({
        key: `file:${rel}`,
        attachmentId: null,
        file: rel,
        url: `${uploadsUrl}/${rel}`,
        mime: null,
        alt: null,
      }));
    }
    if (allowExternal && /^https?:\/\//.test(u))
      return ensureMedia(`url:${u}`, () => ({
        key: `url:${u}`,
        attachmentId: null,
        file: null,
        url: u,
        mime: null,
        alt: null,
      }));
    return null;
  };
  const urlIndex = new Map<string, string>();
  for (const r of records) if (typeof r.permalink === "string") urlIndex.set(normalizePath(r.permalink), r.key);
  const sitePath = (url: string): string | null => {
    if (url.startsWith("/") && !url.startsWith("//")) return url;
    try {
      const parsed = new URL(url.startsWith("//") ? `https:${url}` : url);
      return siteHosts.has(parsed.host) ? `${parsed.pathname}${parsed.search}${parsed.hash}` || "/" : null;
    } catch {
      return null;
    }
  };
  /** The staged record an internal URL points at (by its WordPress permalink). */
  const recordForUrl = (url: string): StagedRecord | undefined => {
    const p = sitePath(url);
    const key = p ? urlIndex.get(normalizePath(p)) : undefined;
    return key ? byKey.get(key) : undefined;
  };
  const internalUrl = (url: string): string => {
    const p = sitePath(url);
    if (p === null) return url;
    const target = recordForUrl(url);
    return target && docIdByKey.has(target.key) ? normalizePath(p) : p;
  };

  // --- pass 2: map --------------------------------------------------------------
  const mapPrepared = ({ mapping, collection, ledger, groups }: Prepared) => {
    const reads = new Set<string>();
    const domain = new Map<string, { records: number; sample: string }>();
    const recalls: number[] = [];
    const translatable = new Set(getTranslatableFieldNames(collection));
    // Per field: how many translations exist, and how many carry a value of their own.
    const divergence = new Map<string, { translations: number; differs: number; samples: string[] }>();
    for (const type of mapping.includes ?? []) {
      for (const r of byType.get(type) ?? []) {
        const seen = new Set<string>();
        collectDomain(r, reusable, (p, value) => {
          const key = `${type}:${p}`;
          const stat = domain.get(key) ?? { records: 0, sample: truncate(value) };
          if (!seen.has(key)) {
            seen.add(key);
            stat.records++;
          }
          domain.set(key, stat);
        });
      }
    }

    for (const members of groups) {
      for (const r of members) {
        const seen = new Set<string>();
        collectDomain(r, reusable, (p, value) => {
          const stat = domain.get(p) ?? { records: 0, sample: truncate(value) };
          if (!seen.has(p)) {
            seen.add(p);
            stat.records++;
          }
          domain.set(p, stat);
        });
      }

      const docId = docIdByKey.get(members[0].key)!;
      const docMedia = new Set<string>();
      const outputs: Array<{ record: StagedRecord; out: Record<string, unknown>; tracker: Tracker }> = [];
      for (const record of members) {
        const tracker = new Tracker(reads);
        const ctx = makeContext({
          mapping,
          record,
          tracker,
          issues: ledger.issues,
          docMedia,
          docIdByKey,
          collectionByType,
          byKey,
          media,
          reusable,
          uploadsDir,
          urlToMediaKey,
          internalUrl,
          recordForUrl,
          byType,
          byGroup,
        });
        try {
          const out = mapping.map(track(record, "", tracker) as any, ctx);
          outputs.push({ record, out: JSON.parse(JSON.stringify(out ?? {})), tracker });
        } catch (e) {
          ledger.issues.push({ kind: "error", key: record.key, message: `map() threw: ${(e as Error).message}` });
        }
      }
      if (!outputs.length || outputs[0].record !== members[0]) continue;

      const [base, ...rest] = outputs;
      const data: Record<string, unknown> = { ...base.out, _id: docId };
      if (collection.drafts && data._status === undefined)
        data._status = ["publish", "private"].includes(base.record.status) ? "published" : "draft";
      if (config.locales && translatable.size && base.record.locale && data._sourceLocale === undefined)
        data._sourceLocale = base.record.locale;

      const translations: Record<string, Record<string, unknown>> = {};
      const expected: Record<string, string[]> = { base: base.tracker.expectedTexts() };
      for (const { record, out, tracker } of rest) {
        if (!record.locale || record.locale === base.record.locale) {
          ledger.issues.push({
            kind: "warning",
            key: record.key,
            message: `translation group member without a distinct locale (${record.locale ?? "none"}) — not imported`,
          });
          continue;
        }
        // A value equal to the original is inherited, not copied: a copy would go stale when the original changes.
        const overlay: Record<string, unknown> = {};
        for (const k of new Set([...Object.keys(out), ...Object.keys(base.out)])) {
          if (k.startsWith("_")) continue;
          const differs = JSON.stringify(out[k] ?? null) !== JSON.stringify(base.out[k] ?? null);
          const stat = divergence.get(k) ?? { translations: 0, differs: 0, samples: [] };
          stat.translations++;
          if (differs) {
            stat.differs++;
            if (stat.samples.length < 3) stat.samples.push(record.key);
          }
          divergence.set(k, stat);
          // Slugs stay explicit: an empty one is regenerated from the translated title.
          const keep = differs || collection.fields[k]?.type === "slug";
          if (translatable.has(k) && keep && k in out) overlay[k] = out[k];
        }
        translations[record.locale] = overlay;
        expected[record.locale] = tracker.expectedTexts();
      }

      const doc = validateDocument(collection, data, config);
      const i18n = validateTranslations(
        config,
        collection,
        Object.keys(translations).length ? translations : undefined,
        data._sourceLocale,
      );
      for (const e of [...doc.errors, ...i18n.errors])
        ledger.issues.push({ kind: "invalid", key: base.record.key, message: `${e.field}: ${e.message}` });
      for (const w of [...doc.warnings, ...i18n.warnings])
        ledger.issues.push({ kind: "shape", key: base.record.key, message: `${w.field}: ${w.message}` });

      for (const { record } of outputs) {
        const locale = record === base.record ? "base" : record.locale!;
        if (!expected[locale]) continue;
        const output = outputStrings(locale === "base" ? data : { ...data, ...translations[locale] });
        const { recall, missing } = textRecall(expected[locale], output, mapping.textMatch);
        recalls.push(recall);
        if (recall < minRecall)
          ledger.issues.push({
            kind: "low-recall",
            key: record.key,
            message: `only ${(recall * 100).toFixed(1)}% of source text reaches the document (missing e.g. ${missing.join(", ")})`,
          });
      }

      if (collection.fields.slug?.type === "slug") {
        for (const { record } of outputs) {
          if (typeof record.permalink !== "string") continue;
          const locale = record === base.record ? data._sourceLocale : record.locale;
          if (locale !== data._sourceLocale && !translations[String(locale)]) continue;
          const slugValue =
            locale === data._sourceLocale ? data.slug : (translations[String(locale)]?.slug ?? data.slug);
          const route = documentRoute(
            collection,
            { slug: slugify(String(slugValue ?? "")) },
            (locale as string | undefined) ?? defaultLocale,
            defaultLocale,
          );
          const before = normalizePath(record.permalink);
          if (route !== before) {
            ledger.issues.push({ kind: "url-change", key: record.key, message: `${before} → ${route}` });
            urlChanges.push({ key: record.key, collection: collection.slug, docId, from: before, to: route });
          }
        }
      }
      docLedger.set(docId, ledger);

      docs.push({
        docId,
        collection: collection.slug,
        sourceKeys: outputs.map((o) => o.record.key),
        data,
        translations,
        expected,
        media: [...docMedia],
        textMatch: mapping.textMatch ?? "multiset",
        hash: sha({ data, translations }),
      });
      ledger.docs++;
    }

    for (const [field, stat] of divergence) {
      const config = collection.fields[field] ?? { type: "text" };
      const share = `${stat.differs} of ${stat.translations} translations`;
      const where = stat.samples.length ? ` (e.g. ${stat.samples.join(", ")})` : "";
      if (!translatable.has(field) && stat.differs) {
        ledger.issues.push({
          kind: "lost-translation",
          message: isTranslatedText(config)
            ? `"${field}" differs in ${share} but isn't translatable; those values are dropped${where}. Text: make it translatable.`
            : `"${field}" differs in ${share} but isn't translatable; the original's value is kept${where}.${stat.differs / stat.translations >= 0.25 ? " That many differences may be intended: consider translatable." : ""}`,
        });
      } else if (
        translatable.has(field) &&
        !isTranslatedText(config) &&
        // Terms exist per language; matching slugs don't make the field shared.
        config.admin?.component !== "taxonomy-select" &&
        stat.translations >= 3 &&
        stat.differs / stat.translations < 0.1
      ) {
        ledger.issues.push({
          kind: "translation-advice",
          message: `"${field}" is translatable but differs in only ${share}${where}; likely shared: drop translatable and the original's value is kept.`,
        });
      }
    }

    ledger.recall = {
      min: recalls.length ? Math.min(...recalls) : 1,
      avg: recalls.length ? recalls.reduce((a, b) => a + b, 0) / recalls.length : 1,
    };
    const usedDrops = new Set<string>();
    for (const [p, stat] of [...domain.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      const drop = firstDrop(mapping, p);
      if (drop) usedDrops.add(drop[0]);
      const status = isCovered(p, reads) ? "mapped" : drop ? "dropped" : "unaccounted";
      ledger.paths.push({ path: p, ...stat, status, reason: status === "dropped" ? drop![1] : undefined });
    }
    ledger.staleDrops = Object.keys(mapping.drop ?? {}).filter((d) => !usedDrops.has(d));
  };
  for (const p of prepared) mapPrepared(p);

  // `url-change` mappings run last: their records are the URL changes the other mappings produced.
  const deferred = active.filter((m) => m.source === URL_CHANGES);
  if (deferred.length) {
    const list: StagedRecord[] = urlChanges.map((c, i) => ({
      key: `${URL_CHANGES}:${i + 1}`,
      type: URL_CHANGES,
      id: i + 1,
      status: "publish",
      from: c.from,
      to: c.to,
      collection: c.collection,
      docId: c.docId,
      sourceKey: c.key,
    }));
    byType.set(URL_CHANGES, list);
    for (const r of list) byKey.set(r.key, r);
    const start = prepared.length;
    for (const m of deferred) prepareMapping(m);
    for (const p of prepared.slice(start)) mapPrepared(p);
  }

  const ids = new Map<string, number>();
  for (const d of docs) ids.set(`${d.collection}/${d.docId}`, (ids.get(`${d.collection}/${d.docId}`) ?? 0) + 1);
  for (const [id, n] of ids)
    if (n > 1) ledgers[0]?.issues.push({ kind: "duplicate-id", message: `${n} documents share the id ${id}` });

  // Every taxonomy-select value must name a term of its taxonomy in that locale.
  const termSets = new Map<string, Set<string>>();
  const collectTerms = (terms: unknown, into: Set<string>) => {
    for (const t of Array.isArray(terms) ? terms : []) {
      if (t && typeof t === "object") {
        if (typeof (t as any).slug === "string") into.add((t as any).slug);
        collectTerms((t as any).children, into);
      }
    }
  };
  const flagBundles = (d: PlannedDoc, terms: unknown, locale: string) => {
    for (const t of Array.isArray(terms) ? terms : []) {
      if (!t || typeof t !== "object") continue;
      if (termParts((t as any).name).length > 1)
        docLedger.get(d.docId)?.issues.push({
          kind: "bundled-term",
          key: d.sourceKeys[0],
          message: `"${(t as any).name}" (${locale}) is several terms in one; split it with termParts()`,
        });
      flagBundles(d, (t as any).children, locale);
    }
  };
  for (const d of docs.filter((x) => x.collection === "taxonomies")) {
    const base = String(d.data._sourceLocale ?? defaultLocale ?? "");
    flagBundles(d, d.data.terms, base);
    for (const [locale, overlay] of Object.entries(d.translations))
      if (overlay.terms) flagBundles(d, overlay.terms, locale);
    const set = new Set<string>();
    collectTerms(d.data.terms, set);
    termSets.set(`${d.data.slug}|${base}`, set);
    for (const [locale, overlay] of Object.entries(d.translations)) {
      const own = new Set<string>();
      collectTerms(overlay.terms ?? d.data.terms, own);
      termSets.set(`${d.data.slug}|${locale}`, own);
    }
  }
  if (termSets.size) {
    for (const d of docs) {
      const collection = collections.get(d.collection)!;
      for (const [name, field] of Object.entries(collection.fields)) {
        if (field.admin?.component !== "taxonomy-select") continue;
        const taxonomy = field.admin.taxonomy ?? field.admin.placeholder ?? "";
        const check = (value: unknown, locale: string) => {
          const set = termSets.get(`${taxonomy}|${locale}`);
          for (const v of Array.isArray(value) ? value : value ? [value] : []) {
            if (!set?.has(String(v)))
              docLedger.get(d.docId)?.issues.push({
                kind: "dangling-term",
                key: d.sourceKeys[0],
                message: `${name}: "${v}" isn't a term of taxonomy "${taxonomy}" (${locale})`,
              });
          }
        };
        check(d.data[name], String(d.data._sourceLocale ?? defaultLocale ?? ""));
        for (const [locale, overlay] of Object.entries(d.translations))
          if (name in overlay) check(overlay[name], locale);
      }
    }
  }

  const mapped = new Set(mappings.flatMap((m) => [m.source, ...(isSkip(m) ? [] : (m.includes ?? []))]));
  const unmapped = options.only
    ? []
    : [...byType.entries()]
        .filter(([type]) => !mapped.has(type) && type !== "wp_block")
        .map(([type, list]) => ({ type, records: list.length }));

  const blocking: string[] = [];
  for (const u of unmapped)
    blocking.push(`source type \`${u.type}\` (${u.records} records) has no mapping or skipSource()`);
  for (const l of ledgers) {
    const open = l.paths.filter((p) => p.status === "unaccounted");
    if (open.length) blocking.push(`\`${l.source}\`: ${open.length} unaccounted path(s)`);
    const counts = new Map<IssueKind, number>();
    for (const i of l.issues) if (BLOCKING.includes(i.kind)) counts.set(i.kind, (counts.get(i.kind) ?? 0) + 1);
    for (const [kind, n] of counts) blocking.push(`\`${l.source}\`: ${n} ${kind} issue(s)`);
  }

  return { ledgers, unmapped, docs, media, blocking, urlChanges, durationMs: Date.now() - started };
};

const hostOf = (u: string) => {
  try {
    return new URL(u).host;
  } catch {
    return "";
  }
};

type ContextDeps = {
  mapping: Mapping;
  record: StagedRecord;
  tracker: Tracker;
  issues: Issue[];
  docMedia: Set<string>;
  docIdByKey: Map<string, string>;
  collectionByType: Map<string, string>;
  byKey: Map<string, StagedRecord>;
  media: Map<string, StagedMedia>;
  reusable: (ref: number) => string | undefined;
  uploadsDir: string | undefined;
  urlToMediaKey: (url: string, allowExternal: boolean) => string | null;
  internalUrl: (url: string) => string;
  recordForUrl: (url: string) => StagedRecord | undefined;
  byType: Map<string, StagedRecord[]>;
  byGroup: Map<string, StagedRecord[]>;
};

const makeContext = (deps: ContextDeps): MapContext => {
  const { mapping, record, tracker, issues, docMedia, docIdByKey, byKey, media } = deps;
  const issue = (kind: IssueKind, message: string) => issues.push({ kind, key: record.key, message });

  const claimMedia = (key: string) => {
    docMedia.add(key);
    const m = media.get(key);
    if (deps.uploadsDir && m?.file && !existsSync(path.join(deps.uploadsDir, m.file)))
      issue("missing-media", `${m.file} not found in ${deps.uploadsDir}`);
    return mediaToken(key);
  };

  const resolveRef = (prefix: "post" | "term", id: unknown, optional?: boolean): string | null => {
    const raw = id && typeof id === "object" ? ((id as any).ID ?? (id as any).term_id ?? (id as any).id) : id;
    if (raw == null || raw === "" || raw === 0 || raw === "0" || raw === false) return null;
    // A full record key (`form:4`) addresses any staged source, not only posts and terms.
    const key = typeof raw === "string" && /^[a-z_:-]+:\d+$/.test(raw) ? raw : `${prefix}:${Number(raw)}`;
    const docId = docIdByKey.get(key);
    if (docId) return docId;
    if (!optional) {
      const target = byKey.get(key);
      issue(
        "dangling-ref",
        `${prefix} ${raw} ${target ? `(${target.type}, ${target.status}) isn't mapped` : "doesn't exist in the source"} — map it, or pass { optional: true }`,
      );
    }
    return null;
  };

  const fileLinkKey = (url: string) =>
    /\.(pdf|docx?|xlsx?|pptx?|zip|jpe?g|png|gif|webp|svg|mp4|mp3)$/i.test(url.split(/[?#]/)[0])
      ? deps.urlToMediaKey(url, false)
      : null;

  const shortcodeHandlers = (html: string): Record<string, ShortcodeHandler> => {
    const handlers: Record<string, ShortcodeHandler> = {};
    for (const name of new Set(findShortcodes(html))) {
      const own = mapping.shortcodes?.[name];
      const fallback = mapping.shortcodes?.["*"];
      if (own === "keep") tracker.read(`shortcode:${name}`, name);
      else if (own) handlers[name] = own;
      else if (firstDrop(mapping, `shortcode:${name}`)) handlers[name] = () => "";
      else if (DEFAULT_SHORTCODES[name]) handlers[name] = DEFAULT_SHORTCODES[name];
      else if (fallback === "keep") tracker.read(`shortcode:${name}`, name);
      else if (fallback) handlers[name] = fallback;
    }
    return handlers;
  };

  const rewriteNodes = (nodes: RichTextNode[]): RichTextNode[] => {
    for (const node of nodes) {
      if (node.type === "image" && typeof node.src === "string") {
        const key = deps.urlToMediaKey(node.src, false);
        if (key) node.src = claimMedia(key);
      }
      if (typeof node.href === "string") {
        const key = fileLinkKey(node.href);
        node.href = key ? claimMedia(key) : deps.internalUrl(node.href);
      }
      if (Array.isArray(node.children)) rewriteNodes(node.children as RichTextNode[]);
    }
    return nodes;
  };

  // `fromSource: false` for HTML a block handler built: its text was already expected via the reads that fed it.
  const htmlNodes = (html: string, fromSource = true): RichTextNode[] => {
    const prepared = replaceShortcodes(html, shortcodeHandlers(html), (name) =>
      tracker.read(`shortcode:${name}`, name),
    );
    const withParagraphs = /<p[\s>]/i.test(prepared) ? prepared : autop(prepared);
    if (fromSource) tracker.expect(htmlText(withParagraphs));
    return rewriteNodes(htmlToRichText(withParagraphs).children as RichTextNode[]);
  };

  const renderBlocks = (blocks: WpBlock[]): ContentNode[] => {
    const out: ContentNode[] = [];
    for (const b of blocks) {
      const base = `block:${b.name}`;
      if (b.name === "core/block") {
        issue("warning", `reusable block ${String(b.attrs.ref)} not found in the source — skipped`);
        continue;
      }
      const handler = mapping.blocks?.[b.name];
      if (handler) {
        tracker.read(base, b.name);
        const input: BlockInput = {
          name: b.name,
          attrs: track(
            Object.fromEntries(Object.entries(b.attrs).filter(([k]) => k !== "data")),
            `${base}.attrs`,
            tracker,
          ),
          data: track(blockData(b), `${base}.data`, tracker),
          get innerHTML() {
            const html = blockHtml(b);
            tracker.read(`${base}.innerHTML`, html);
            return html;
          },
          inner: () => renderBlocks(b.innerBlocks),
        };
        const result = handler(input, ctx);
        if (typeof result === "string") out.push(...(htmlNodes(result, false) as ContentNode[]));
        else if (Array.isArray(result)) out.push(...result);
        else if (result) out.push(result);
      } else if (firstDrop(mapping, base)) {
        continue;
      } else if (CONTAINER_BLOCKS.has(b.name)) {
        tracker.read(base, b.name);
        out.push(...(b.innerBlocks.length ? renderBlocks(b.innerBlocks) : (htmlNodes(b.innerHTML) as ContentNode[])));
      } else if (EMPTY_BLOCKS.has(b.name)) {
        tracker.read(base, b.name);
      } else if (HTML_BLOCKS.has(b.name)) {
        const markInner = (list: WpBlock[]) => {
          for (const inner of list) {
            tracker.read(`block:${inner.name}`, inner.name);
            markInner(inner.innerBlocks);
          }
        };
        tracker.read(base, b.name);
        markInner(b.innerBlocks);
        out.push(...(htmlNodes(blockHtml(b)) as ContentNode[]));
      }
      // Anything else is unaccounted: left out of the document, listed in the ledger until handled or dropped.
    }
    return out;
  };

  const ctx: MapContext = {
    locale: record.locale,
    ref: (id, o) => resolveRef("post", id, o?.optional),
    refs: (ids, o) => {
      const list = Array.isArray(ids) ? ids : ids == null || ids === "" ? [] : [ids];
      return [...new Set(list.map((id) => resolveRef("post", id, o?.optional)).filter((x): x is string => !!x))];
    },
    term: (id, o) => resolveRef("term", id, o?.optional),
    refLink: (id, o) => {
      const docId = resolveRef("post", id, o?.optional);
      const raw = id && typeof id === "object" ? (id as any).ID : id;
      const target = byKey.get(`post:${Number(raw)}`);
      const collection = target && deps.collectionByType.get(target.type);
      return docId && collection
        ? {
            type: "reference",
            docId,
            collection,
            url: typeof target.permalink === "string" ? normalizePath(target.permalink) : "",
            ...(target.title ? { title: String(target.title) } : {}),
          }
        : null;
    },
    media: (value, o) => {
      const raw =
        value && typeof value === "object" ? ((value as any).ID ?? (value as any).id ?? (value as any).url) : value;
      if (raw == null || raw === "" || raw === 0 || raw === "0" || raw === false) return null;
      const key =
        typeof raw === "number" || /^\d+$/.test(String(raw))
          ? media.has(`att:${raw}`)
            ? `att:${raw}`
            : null
          : deps.urlToMediaKey(String(raw), true);
      if (!key) {
        if (!o?.optional) issue("missing-media", `media ${truncate(raw, 60)} isn't in the source`);
        return null;
      }
      return claimMedia(key);
    },
    content: (html) => {
      tracker.consume(html);
      if (typeof html !== "string" || !html.trim()) return { type: "root", children: [] };
      // "keep" shortcodes are literal text wherever they sit, including blocks that never become rich text.
      for (const name of new Set(findShortcodes(html.replace(/<!--(?!\s*\/?wp:)[\s\S]*?-->/g, "")))) {
        const rule = mapping.shortcodes?.[name] ?? (DEFAULT_SHORTCODES[name] ? undefined : mapping.shortcodes?.["*"]);
        if (rule === "keep" && !firstDrop(mapping, `shortcode:${name}`)) tracker.read(`shortcode:${name}`, name);
      }
      return { type: "root", children: renderBlocks(expandBlocks(html, deps.reusable)) };
    },
    richText: (html) => {
      tracker.consume(html);
      if (typeof html !== "string" || !html.trim()) return { type: "root", children: [] };
      return { type: "root", children: htmlNodes(html) };
    },
    text: (html) => {
      tracker.consume(html);
      const t = typeof html === "string" ? htmlText(html) : "";
      tracker.expect(t);
      return t;
    },
    link: (value) => {
      if (!value) return null;
      const v =
        typeof value === "string" ? { url: value } : (value as { url?: string; title?: string; target?: string });
      if (!v.url) return null;
      const key = fileLinkKey(v.url);
      const target = key ? undefined : deps.recordForUrl(v.url);
      const docId = target && docIdByKey.get(target.key);
      const collection = target && deps.collectionByType.get(target.type);
      if (target && docId && collection)
        return {
          type: "reference",
          docId,
          collection,
          url: normalizePath(String(target.permalink)),
          ...(target.title ? { title: String(target.title) } : {}),
          ...(v.title ? { label: v.title } : {}),
          ...(v.target === "_blank" ? { newTab: true } : {}),
        };
      return {
        type: "custom",
        url: key ? claimMedia(key) : deps.internalUrl(v.url),
        ...(v.title ? { label: v.title } : {}),
        ...(v.target === "_blank" ? { newTab: true } : {}),
      };
    },
    date: (value) => {
      if (value == null || value === "") return null;
      const s = String(value);
      if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
      if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s)) return s.replace(" ", "T");
      if (!Number.isNaN(Date.parse(s))) return s;
      issue("warning", `unparseable date ${truncate(s, 40)}`);
      return null;
    },
    record: (keyOrId) =>
      byKey.get(typeof keyOrId === "number" || /^\d+$/.test(String(keyOrId)) ? `post:${keyOrId}` : String(keyOrId)),
    translation: (keyOrRecord, locale) => {
      const raw = keyOrRecord && typeof keyOrRecord === "object" ? (keyOrRecord as any).key : keyOrRecord;
      const r = byKey.get(String(raw));
      if (!r) return undefined;
      if (r.locale === locale) return r as SourceRecord;
      return deps.byGroup.get(String(r.group))?.find((m) => m.locale === locale) as SourceRecord | undefined;
    },
    records: (type, filter) => {
      if (!mapping.includes?.includes(type))
        throw new Error(`ctx.records("${type}") needs "${type}" in the mapping's includes`);
      return (deps.byType.get(type) ?? [])
        .filter((r) => !filter || filter(r))
        .map((r) => track(r, `${type}:`, tracker) as SourceRecord);
    },
    warn: (message) => issue("warning", message),
  };
  return ctx;
};
