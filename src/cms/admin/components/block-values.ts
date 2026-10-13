// React-free helpers for block values, shared by the block editors (re-exported
// from block-fields.tsx) and unit-tested directly.
import type { SubFieldMeta } from "./block-fields";

export function humanize(value: string) {
  return value
    .replace(/^_+/, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[-_]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\w/, (char) => char.toUpperCase());
}

/** Build a blank value object for a freshly inserted block of the given type. */
export function blankBlockFields(fieldsMeta: Record<string, SubFieldMeta>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [fieldName, meta] of Object.entries(fieldsMeta)) {
    if (meta.defaultValue !== undefined) out[fieldName] = meta.defaultValue;
    else if (meta.type === "boolean") out[fieldName] = false;
    else if (meta.type === "array" || meta.type === "blocks") out[fieldName] = [];
    else out[fieldName] = "";
  }
  return out;
}

type PreviewNode = { value?: unknown; children?: PreviewNode[] };

const richTextPreview = (value: unknown): string => {
  let doc = value;
  if (typeof doc === "string") {
    try {
      doc = JSON.parse(doc);
    } catch {
      return "";
    }
  }
  const collect = (node: PreviewNode): string =>
    typeof node.value === "string" ? node.value : (node.children ?? []).map(collect).join(" ");
  return doc && typeof doc === "object"
    ? collect(doc as PreviewNode)
        .replace(/\s+/g, " ")
        .trim()
    : "";
};

/**
 * Collapsed block/row preview: the first text or rich-text value, else the first
 * image's file name — so a text-less block (an image, a video) still says what it holds.
 */
export function getPreviewText(values: Record<string, unknown>, fieldsMeta: Record<string, SubFieldMeta>): string {
  const clip = (text: string) => (text.length > 60 ? text.slice(0, 60) + "..." : text);
  for (const [key, meta] of Object.entries(fieldsMeta)) {
    if (meta.type === "text" && values[key]) return clip(String(values[key]));
    if (meta.type === "richText") {
      const text = richTextPreview(values[key]);
      if (text) return clip(text);
    }
  }
  for (const [key, meta] of Object.entries(fieldsMeta)) {
    if (meta.type === "image" && typeof values[key] === "string" && values[key]) {
      return String(values[key]).split("/").pop() ?? "";
    }
  }
  return "";
}

/**
 * Rows of a repeater value as display text, for read-only rendering. Columns
 * follow `itemFields` when declared, otherwise every key seen in the rows.
 */
export function repeaterTable(
  value: unknown,
  itemFields?: Record<string, SubFieldMeta>,
): { columns: { key: string; label: string }[]; rows: string[][] } {
  let items: unknown = value;
  if (typeof items === "string") {
    try {
      items = JSON.parse(items || "[]");
    } catch {
      items = [];
    }
  }
  const rows = (Array.isArray(items) ? items : []).filter(
    (row): row is Record<string, unknown> => !!row && typeof row === "object" && !Array.isArray(row),
  );
  const keys = itemFields ? Object.keys(itemFields) : [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const text = (cell: unknown) => {
    if (cell === null || cell === undefined || cell === "") return "–";
    if (typeof cell === "boolean") return cell ? "Yes" : "No";
    if (typeof cell === "object") return JSON.stringify(cell);
    return String(cell);
  };
  return {
    columns: keys.map((key) => ({ key, label: itemFields?.[key]?.label ?? humanize(key) })),
    rows: rows.map((row) => keys.map((key) => text(row[key]))),
  };
}
