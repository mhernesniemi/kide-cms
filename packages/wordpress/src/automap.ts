/**
 * Mapping by shape: the target's declared fields say what to read and how to convert it, so a
 * mapping only spells out what differs. Reads go through the tracked record, so whatever isn't
 * consumed stays unaccounted in the ledger.
 */
import type { CollectionConfig, FieldConfig } from "@kidecms/core";
import type { MapContext, SourceRecord } from "./mapping";

const snake = (name: string) => name.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
const empty = (v: unknown) => v === undefined || v === null || v === "" || (Array.isArray(v) && !v.length);
// Reading a tracked key only marks it when filled, so trying both spellings is free.
// `image` also reads `imageId` / `imageUrl` / `image_id`, as block attributes often name them.
const pick = (source: Record<string, any> | undefined, name: string) =>
  source == null
    ? undefined
    : (source[name] ??
      source[snake(name)] ??
      source[`${name}Id`] ??
      source[`${snake(name)}_id`] ??
      source[`${name}Url`]);

/** One ACF/WordPress value → the declared field's value shape. `undefined` leaves the field out. */
export const convertField = (field: FieldConfig, value: any, ctx: MapContext, name = ""): unknown => {
  if (empty(value)) return undefined;
  const component = field.admin?.component;
  switch (field.type) {
    case "image":
      return ctx.media(value);
    case "richText":
      return ctx.richText(value);
    case "content":
      return ctx.content(value);
    case "boolean":
      return value === true || value === 1 || value === "1" || value === "true";
    case "number":
      return Number(value);
    case "date":
      return ctx.date(value) ?? undefined;
    case "relation": {
      // A reference to something not imported (deleted, draft) is left out, not a blocking issue.
      const ids = (Array.isArray(value) ? value : [value]).filter((v) => !empty(v));
      const refs = ids.map((id) => ctx.ref(id, { optional: true }));
      const lost = ids.filter((_, i) => !refs[i]);
      if (lost.length) ctx.warn(`${name}: ${lost.length} reference(s) to records that aren't imported were left out`);
      const kept = refs.filter((r): r is string => !!r);
      return field.hasMany ? kept : (kept[0] ?? undefined);
    }
    case "array":
      return (Array.isArray(value) ? value : [value])
        .map((v) => (field.of.type === "image" ? ctx.media(v) : String(v)))
        .filter(Boolean);
    case "json":
      if (component === "link") {
        // ACF post-object and relationship fields store a post id where a link is declared.
        const id = typeof value === "object" && !value.url ? (value.ID ?? value.id) : value;
        if (typeof id === "number" || /^\d+$/.test(String(id))) {
          const link = ctx.refLink(id, { optional: true });
          if (!link) ctx.warn(`${name}: post ${id} isn't imported, so its link was left out`);
          return link ?? undefined;
        }
        return ctx.link(value) ?? undefined;
      }
      if (field.itemFields) {
        const rows = (Array.isArray(value) ? value : []).map((row) => autoFields(field.itemFields!, row, ctx));
        return rows.filter((row) => Object.keys(row).length);
      }
      if (component === "taxonomy-select") return (Array.isArray(value) ? value : [value]).map(String);
      return value;
    case "text":
      if (component === "color") return String(value).toUpperCase();
      return typeof value === "string" && /<[a-z]/i.test(value) ? ctx.text(value) : String(value);
    case "blocks":
      return undefined;
    default:
      return typeof value === "object" ? value : String(value);
  }
};

/** Every declared field filled from the same-named source value (camelCase or snake_case). */
export const autoFields = (fields: Record<string, FieldConfig>, source: Record<string, any>, ctx: MapContext) => {
  const out: Record<string, unknown> = {};
  for (const [name, field] of Object.entries(fields)) {
    const value = convertField(field, pick(source, name), ctx, name);
    if (value !== undefined) out[name] = value;
  }
  return out;
};

/** `jobTitles`, `job-titles` and `job_title` are one taxonomy: compare without case, separators or plural. */
const termKey = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .replace(/s$/, "");

const TERM_KEYS: Record<string, string[]> = { tags: ["post_tag"], categories: ["category"], category: ["category"] };

/** Standard post columns, Yoast SEO and terms by field name; everything else from ACF meta by name. */
const RECORD_SOURCES: Record<string, (src: SourceRecord) => unknown> = {
  title: (src) => src.title,
  slug: (src) => (src.frontPage ? "home" : src.slug),
  excerpt: (src) => src.excerpt,
  publishedAt: (src) => src.date,
  date: (src) => src.date,
  parent: (src) => src.parent,
  image: (src) => src.featuredImage,
  featuredImage: (src) => src.featuredImage,
  seoTitle: (src) => src.meta?._yoast_wpseo_title,
  metaTitle: (src) => src.meta?._yoast_wpseo_title,
  seoDescription: (src) => src.meta?._yoast_wpseo_metadesc,
  metaDescription: (src) => src.meta?._yoast_wpseo_metadesc,
  ogTitle: (src) => src.meta?.["_yoast_wpseo_opengraph-title"],
  ogDescription: (src) => src.meta?.["_yoast_wpseo_opengraph-description"],
  ogImage: (src) => src.meta?.["_yoast_wpseo_opengraph-image-id"] || src.meta?.["_yoast_wpseo_opengraph-image"],
  noindex: (src) => src.meta?.["_yoast_wpseo_meta-robots-noindex"] === "1" || undefined,
  nofollow: (src) => src.meta?.["_yoast_wpseo_meta-robots-nofollow"] === "1" || undefined,
};

export const autoRecord = (src: SourceRecord, collection: CollectionConfig, ctx: MapContext) => {
  const out: Record<string, unknown> = {};
  let body = false;
  for (const [name, field] of Object.entries(collection.fields)) {
    let raw: unknown;
    if (field.type === "content" && !body) {
      body = true;
      raw = src.content;
    } else if (field.admin?.component === "taxonomy-select") {
      const taxonomy = String(field.admin.taxonomy ?? name);
      const wanted = new Set([name, taxonomy, ...(TERM_KEYS[name] ?? []), ...(TERM_KEYS[taxonomy] ?? [])].map(termKey));
      const key = Object.keys(src.terms ?? {}).find((k) => wanted.has(termKey(k)) && src.terms[k]?.length);
      const slugs = key ? (src.terms[key] as any[]).map((t) => t.slug) : undefined;
      raw = field.type === "text" ? slugs?.[0] : slugs;
    } else raw = RECORD_SOURCES[name]?.(src) ?? pick(src.meta, name);
    if (field.type === "relation" && name === "parent") {
      const parent = ctx.ref(raw, { optional: true });
      if (parent) out[name] = parent;
      continue;
    }
    const value = convertField(field, raw, ctx, name);
    if (value !== undefined) out[name] = value;
  }
  return out;
};
