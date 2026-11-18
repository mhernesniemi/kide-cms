/**
 * The "domain" of a source record: every non-empty leaf path a mapping has to
 * account for (map it or drop it with a reason). Shared by `scout` (profile)
 * and `plan` (coverage ledger) so both speak the same paths:
 *
 *   title · meta.hero_title · meta.rows[].label · terms.category
 *   block:acf/hero · block:acf/hero.data.heading · shortcode:gallery
 */
import { decodeEntities } from "../values";
import { findShortcodes, isAcfBlock, nestAcf, parseBlocks, walkBlocks, type WpBlock } from "./gutenberg";
import type { StagedRecord } from "./staging";

/** Engine-owned fields: used for ids, status, locales — never part of coverage. */
export const STRUCTURAL = new Set([
  "key",
  "type",
  "id",
  "status",
  "locale",
  "group",
  "modified",
  "permalink",
  "frontPage",
]);
const VISUAL_ATTRS = new Set([
  "className",
  "align",
  "style",
  "backgroundColor",
  "textColor",
  "gradient",
  "fontSize",
  "fontFamily",
  "layout",
  "lock",
  "metadata",
  "anchor",
]);

export const isEmpty = (v: unknown): boolean =>
  v == null ||
  (typeof v === "string" && !v.trim()) ||
  (Array.isArray(v) && v.length === 0) ||
  (typeof v === "object" &&
    !Array.isArray(v) &&
    (Object.keys(v as object).length === 0 ||
      ((v as Record<string, unknown>).type === "root" && isEmpty((v as Record<string, unknown>).children))));

export const truncate = (v: unknown, n = 80): string => {
  const s = typeof v === "string" ? v : JSON.stringify(v);
  const flat = s.replace(/\s+/g, " ").trim();
  return flat.length > n ? `${flat.slice(0, n - 1)}…` : flat;
};

// Objects keyed by data (keywords, ids, dates) are one value, not hundreds of fields.
const MAP_LIKE_KEYS = 40;

const walkLeaves = (value: unknown, path: string, visit: (path: string, value: unknown) => void) => {
  if (isEmpty(value)) return;
  if (Array.isArray(value)) {
    for (const item of value) walkLeaves(item, `${path}[]`, visit);
  } else if (typeof value === "object" && (!path || Object.keys(value as object).length <= MAP_LIKE_KEYS)) {
    for (const [k, v] of Object.entries(value as Record<string, unknown>))
      walkLeaves(v, path ? `${path}.${k}` : k, visit);
  } else {
    visit(path, value);
  }
};

export const blockData = (block: WpBlock): Record<string, unknown> =>
  isAcfBlock(block) ? nestAcf(block.attrs.data as Record<string, unknown>) : {};

export const blockAttrs = (block: WpBlock): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(block.attrs).filter(
      ([k]) =>
        !VISUAL_ATTRS.has(k) &&
        !(block.name.startsWith("acf/") && ["data", "name", "mode", "id", "wpClassName"].includes(k)),
    ),
  );

export const isCoreBlock = (name: string) => name.startsWith("core/");

/** Blocks of a post, with `core/block` (reusable block) references expanded in place. */
export const expandBlocks = (content: string, reusable: (ref: number) => string | undefined, depth = 0): WpBlock[] => {
  const expandList = (list: WpBlock[]): { blocks: WpBlock[]; counts: number[] } => {
    const blocks: WpBlock[] = [];
    const counts: number[] = [];
    for (const b of list) {
      const inner =
        b.name === "core/block" && typeof b.attrs.ref === "number" && depth < 5 ? reusable(b.attrs.ref) : undefined;
      const expanded = inner === undefined ? [expandOne(b)] : expandBlocks(inner, reusable, depth + 1);
      blocks.push(...expanded);
      counts.push(expanded.length);
    }
    return { blocks, counts };
  };
  const expandOne = (b: WpBlock): WpBlock => {
    const { blocks, counts } = expandList(b.innerBlocks);
    let i = 0;
    const innerContent = b.innerContent.flatMap((part) => (part === null ? Array(counts[i++]).fill(null) : [part]));
    return { ...b, innerBlocks: blocks, innerContent };
  };
  return expandList(parseBlocks(content)).blocks;
};

export const collectDomain = (
  record: StagedRecord,
  reusable: (ref: number) => string | undefined,
  visit: (path: string, value: unknown) => void,
) => {
  for (const [k, v] of Object.entries(record)) {
    if (STRUCTURAL.has(k)) continue;
    if (k === "terms") {
      for (const [tax, list] of Object.entries((v as Record<string, unknown>) ?? {}))
        if (!isEmpty(list)) visit(`terms.${tax}`, list);
      continue;
    }
    walkLeaves(v, k, visit);
  }
  if (typeof record.content === "string" && record.content.trim()) {
    for (const block of walkBlocks(expandBlocks(record.content, reusable))) {
      if (block.name === "core/block") continue;
      const base = `block:${block.name}`;
      visit(base, block.name);
      if (isCoreBlock(block.name)) continue;
      walkLeaves(blockData(block), `${base}.data`, visit);
      walkLeaves(blockAttrs(block), `${base}.attrs`, visit);
      if (!isAcfBlock(block) && htmlText(block.innerHTML)) visit(`${base}.innerHTML`, block.innerHTML);
    }
    // Brackets inside HTML comments (`<!--[if lte IE 8]>`) aren't shortcodes.
    const text = record.content.replace(/<!--(?!\s*\/?wp:)[\s\S]*?-->/g, "");
    for (const name of new Set(findShortcodes(text))) visit(`shortcode:${name}`, name);
  }
};

// --- glob matching for `drop` --------------------------------------------------

const globCache = new Map<string, RegExp>();
export const matchesPath = (pattern: string, path: string): boolean => {
  if (pattern === path || path.startsWith(`${pattern}.`) || path.startsWith(`${pattern}[]`)) return true;
  if (!pattern.includes("*")) return false;
  let re = globCache.get(pattern);
  if (!re) {
    re = new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}(\\.|\\[\\]|$)`);
    globCache.set(pattern, re);
  }
  return re.test(path);
};

export const isCovered = (path: string, reads: Set<string>): boolean => {
  if (reads.has(path)) return true;
  for (const r of reads) if (r.startsWith(`${path}.`) || r.startsWith(`${path}[]`)) return true;
  return false;
};

// --- text helpers ---------------------------------------------------------------

export const htmlText = (html: string): string =>
  decodeEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();

export const words = (text: string): string[] => text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];

/** Every string leaf in a value (rich-text text nodes, block fields, plain fields). */
export const outputStrings = (value: unknown, out: string[] = []): string[] => {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) for (const v of value) outputStrings(v, out);
  else if (value && typeof value === "object") for (const v of Object.values(value)) outputStrings(v, out);
  return out;
};

/** Share of expected words (multiset) that appear in the output. 1 when nothing was expected. */
export const textRecall = (
  expected: string[],
  output: string[],
  mode: "multiset" | "set" = "multiset",
): { recall: number; missing: string[] } => {
  const have = new Map<string, number>();
  for (const w of output.flatMap((s) => words(s))) have.set(w, mode === "set" ? Infinity : (have.get(w) ?? 0) + 1);
  const all = expected.flatMap((s) => words(s));
  const exp = mode === "set" ? [...new Set(all)] : all;
  if (!exp.length) return { recall: 1, missing: [] };
  let hit = 0;
  const missing: string[] = [];
  for (const w of exp) {
    const n = have.get(w) ?? 0;
    if (n > 0) {
      hit++;
      have.set(w, n - 1);
    } else if (missing.length < 12) missing.push(w);
  }
  return { recall: hit / exp.length, missing };
};
