/** Gutenberg blocks, shortcodes and autop via WordPress's own packages, plus ACF flat-meta reconstruction. */
import { autop as wpautop } from "@wordpress/autop";
import { parse } from "@wordpress/block-serialization-default-parser";
import { replace as replaceShortcode } from "@wordpress/shortcode";

export type WpBlock = {
  name: string;
  attrs: Record<string, unknown>;
  innerHTML: string;
  innerBlocks: WpBlock[];
  /** innerHTML segments with `null` where each inner block sits. */
  innerContent: Array<string | null>;
};

/** Parse post_content into blocks (WordPress's own parser). HTML outside any block becomes `core/freeform`. */
type ParsedBlock = ReturnType<typeof parse>[number];

export const parseBlocks = (content: string): WpBlock[] => {
  const convert = (b: ParsedBlock): WpBlock => ({
    name: b.blockName ?? "core/freeform",
    attrs: (b.attrs ?? {}) as Record<string, unknown>,
    innerHTML: b.innerHTML,
    innerBlocks: b.innerBlocks.map(convert),
    innerContent: b.innerContent,
  });
  return parse(content)
    .filter((b) => b.blockName || b.innerHTML.trim())
    .map(convert);
};

/** A block's full HTML with inner blocks rendered in place. */
export const blockHtml = (block: WpBlock): string => {
  let i = 0;
  return block.innerContent.map((part) => part ?? blockHtml(block.innerBlocks[i++])).join("");
};

export const isAcfBlock = (block: WpBlock) => block.name.startsWith("acf/") && typeof block.attrs.data === "object";

export const walkBlocks = function* (blocks: WpBlock[]): Generator<WpBlock> {
  for (const block of blocks) {
    yield block;
    yield* walkBlocks(block.innerBlocks);
  }
};

const SHORTCODE = /\[(\/)?([a-z][a-z0-9_-]*)((?:\s[^\]]*)?)(\/)?\]/gi;

export const findShortcodes = (html: string): string[] =>
  [...html.matchAll(SHORTCODE)].filter((m) => !m[1]).map((m) => m[2].toLowerCase());

/** HTML, or content nodes (spliced in where the shortcode stood). */
export type ShortcodeHandler = (attrs: Record<string, string>, inner: string) => string | object | object[];

/**
 * Replace shortcodes whose name has a handler; others are left in place. A handler returning
 * content nodes leaves the placeholder `embed` gives back, for the caller to splice them in.
 */
export const replaceShortcodes = (
  html: string,
  handlers: Record<string, ShortcodeHandler>,
  onHandled: (name: string) => void,
  embed: (nodes: object[]) => string = () => "",
): string => {
  let out = html;
  for (const name of Object.keys(handlers))
    out = replaceShortcode(name, out, (shortcode) => {
      onHandled(name);
      const { named, numeric } = shortcode.attrs;
      const attrs = { ...Object.fromEntries(numeric.map((v, i) => [String(i), v])), ...named } as Record<
        string,
        string
      >;
      const result = handlers[name](attrs, shortcode.content ?? "");
      return typeof result === "string" ? result : embed(Array.isArray(result) ? result : [result]);
    });
  return out;
};

/** WordPress's `wpautop`: classic-editor content separates paragraphs with blank lines, not tags. */
export const autop = (html: string): string => (html.trim() ? wpautop(html) : html);

/**
 * Rebuild ACF's flattened storage into nested values: a repeater is a row count
 * at `name` plus `name_<i>_<sub>` keys; flexible content stores the layout names
 * as an array instead of a count. `_name` companions (`field_…` keys) are dropped.
 */
export const nestAcf = (flat: Record<string, unknown>, listFields?: Set<string>): Record<string, unknown> => {
  const keys = Object.keys(flat)
    .filter((k) => !(k.startsWith("_") && typeof flat[k] === "string" && /^field_/.test(flat[k] as string)))
    .sort((a, b) => a.length - b.length);
  const consumed = new Set<string>();
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    if (consumed.has(key)) continue;
    const value = flat[key];
    if (value === "" && listFields?.has(String(flat[`_${key}`]))) {
      out[key] = [];
      continue;
    }
    const layouts = Array.isArray(value) && value.every((v) => typeof v === "string") ? (value as string[]) : null;
    const count =
      typeof value === "number" || (typeof value === "string" && /^\d+$/.test(value)) ? Number(value) : null;
    const hasRows = keys.some((k) => k.startsWith(`${key}_0_`));
    if ((layouts || count !== null) && hasRows) {
      const n = layouts ? layouts.length : count!;
      const rows: Record<string, unknown>[] = [];
      for (let i = 0; i < n; i++) {
        const prefix = `${key}_${i}_`;
        const sub: Record<string, unknown> = {};
        for (const k of keys) {
          if (!k.startsWith(prefix)) continue;
          sub[k.slice(prefix.length)] = flat[k];
          consumed.add(k);
        }
        const row = nestAcf(sub, listFields);
        if (layouts) row.acf_fc_layout = layouts[i];
        rows.push(row);
      }
      out[key] = rows;
    } else {
      out[key] = value;
    }
  }
  return out;
};
