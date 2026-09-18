// React-free helpers for block values, shared by the block editors (re-exported
// from block-fields.tsx) and unit-tested directly.
import type { SubFieldMeta } from "./block-fields";

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
  return doc && typeof doc === "object" ? collect(doc as PreviewNode).replace(/\s+/g, " ").trim() : "";
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
