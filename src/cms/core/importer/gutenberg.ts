/** Gutenberg block-comment parser, shortcode scanner and ACF flat-meta reconstruction. */

export type WpBlock = {
  name: string;
  attrs: Record<string, unknown>;
  innerHTML: string;
  innerBlocks: WpBlock[];
  /** innerHTML segments with `null` where each inner block sits. */
  innerContent: Array<string | null>;
};

const DELIMITER = /<!--\s+(\/)?wp:([a-z][a-z0-9_-]*\/)?([a-z][a-z0-9_-]*)\s+(\{(?:(?!-->)[\s\S])*?\}\s+)?(\/)?-->/g;

/** Parse post_content into blocks. HTML outside any block becomes `core/freeform` (classic content). */
export const parseBlocks = (content: string): WpBlock[] => {
  const root: WpBlock = { name: "#root", attrs: {}, innerHTML: "", innerBlocks: [], innerContent: [] };
  const stack: WpBlock[] = [];
  let last = 0;

  const addFreeform = (html: string) => {
    if (!html.trim()) return;
    const parent = stack.at(-1);
    if (parent) {
      parent.innerHTML += html;
      parent.innerContent.push(html);
    } else
      root.innerBlocks.push({
        name: "core/freeform",
        attrs: {},
        innerHTML: html,
        innerBlocks: [],
        innerContent: [html],
      });
  };

  for (const m of content.matchAll(DELIMITER)) {
    const [whole, closer, ns, nameOnly, json, selfClose] = m;
    const name = `${ns ?? "core/"}${nameOnly}`;
    addFreeform(content.slice(last, m.index));
    last = m.index! + whole.length;
    let attrs: Record<string, unknown> = {};
    if (json) {
      try {
        attrs = JSON.parse(json);
      } catch {
        attrs = {};
      }
    }
    const parent = stack.at(-1) ?? root;
    if (closer) {
      const idx = stack.findLastIndex((b) => b.name === name);
      if (idx >= 0) stack.length = idx;
    } else {
      const block: WpBlock = { name, attrs, innerHTML: "", innerBlocks: [], innerContent: [] };
      parent.innerBlocks.push(block);
      if (parent !== root) parent.innerContent.push(null);
      if (!selfClose) stack.push(block);
    }
  }
  addFreeform(content.slice(last));
  return root.innerBlocks;
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

const parseShortcodeAttrs = (raw: string): Record<string, string> => {
  const attrs: Record<string, string> = {};
  for (const m of raw.matchAll(/([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))|"([^"]*)"|(\S+)/g)) {
    if (m[1]) attrs[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? "";
    else attrs[String(Object.keys(attrs).length)] = m[5] ?? m[6] ?? "";
  }
  return attrs;
};

export type ShortcodeHandler = (attrs: Record<string, string>, inner: string) => string;

/** Replace shortcodes whose name has a handler; others are left in place. */
export const replaceShortcodes = (
  html: string,
  handlers: Record<string, ShortcodeHandler>,
  onHandled: (name: string) => void,
): string => {
  let out = html;
  for (const name of Object.keys(handlers)) {
    const paired = new RegExp(`\\[${name}(\\s[^\\]]*)?\\]([\\s\\S]*?)\\[\\/${name}\\]`, "gi");
    const single = new RegExp(`\\[${name}(\\s[^\\]]*)?\\/?\\]`, "gi");
    out = out
      .replace(paired, (_, raw = "", inner) => (onHandled(name), handlers[name](parseShortcodeAttrs(raw), inner)))
      .replace(single, (_, raw = "") => (onHandled(name), handlers[name](parseShortcodeAttrs(raw), "")));
  }
  return out;
};

const BLOCK_TAG = /<\/?(p|div|h[1-6]|ul|ol|li|blockquote|pre|table|figure|section|hr|img|iframe)\b/i;

/** WordPress `wpautop` lite: classic-editor content separates paragraphs with blank lines, not tags. */
export const autop = (html: string): string => {
  if (!html.trim()) return html;
  return html
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => (BLOCK_TAG.test(part) ? part : `<p>${part.replace(/\n/g, "<br>")}</p>`))
    .join("\n");
};

/**
 * Rebuild ACF's flattened storage into nested values: a repeater is a row count
 * at `name` plus `name_<i>_<sub>` keys; flexible content stores the layout names
 * as an array instead of a count. `_name` companions (`field_…` keys) are dropped.
 */
export const nestAcf = (flat: Record<string, unknown>): Record<string, unknown> => {
  const keys = Object.keys(flat)
    .filter((k) => !(k.startsWith("_") && typeof flat[k] === "string" && /^field_/.test(flat[k] as string)))
    .sort((a, b) => a.length - b.length);
  const consumed = new Set<string>();
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    if (consumed.has(key)) continue;
    const value = flat[key];
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
        const row = nestAcf(sub);
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
