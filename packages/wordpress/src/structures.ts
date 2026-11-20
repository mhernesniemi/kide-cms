/**
 * WordPress structures every site has, converted to the shapes of Kide's presets:
 * nav menus → `menu-items`, a taxonomy → `taxonomy-terms`, a Gravity Form → a `forms` document.
 * Built on the public `MapContext`, so what they read joins the mapping's coverage.
 */
import { decodeEntities, slugify } from "@kidecms/core";
import type { MapContext, MenuItem, SourceRecord, TermNode } from "./mapping";
import { termParts } from "./terms";

const MAX_MENU_DEPTH = 3;
/** Reading a tracked value is what marks it covered. */
const touch = (..._values: unknown[]) => {};

export const menuItems = (menu: SourceRecord, ctx: MapContext): MenuItem[] => {
  const rows = ctx
    .records("nav_menu_item", (r) => ((r.terms as any)?.nav_menu ?? []).some((t: any) => t.id === menu.id))
    .sort((a, b) => Number(a.menuOrder ?? 0) - Number(b.menuOrder ?? 0));
  const items = new Map<string, MenuItem>();
  const parents = new Map<string, string>();
  for (const r of rows) {
    touch(r.terms?.nav_menu?.[0]?.id, r.meta?._menu_item_object);
    const m = r.meta ?? {};
    const target = m._menu_item_type === "taxonomy" ? `term:${m._menu_item_object_id}` : m._menu_item_object_id;
    const record = m._menu_item_type === "custom" ? undefined : ctx.record(target);
    if (m._menu_item_type === "post_type" && !ctx.ref(target, { optional: true })) {
      ctx.warn(
        `menu "${menu.name}": item ${r.id} points to ${m._menu_item_object} ${target}, which isn't imported — left out`,
      );
      continue;
    }
    const url = record ? record.permalink : m._menu_item_url;
    items.set(String(r.id), {
      id: `item-${r.id}`,
      label: String(r.title || record?.title || record?.name || ""),
      href: ctx.link(String(url ?? ""))?.url ?? "",
      ...(m._menu_item_target === "_blank" ? { target: "_blank" as const } : {}),
      children: [],
    });
    const parent = String(m._menu_item_menu_item_parent ?? "0");
    if (parent !== "0") parents.set(String(r.id), parent);
  }
  const roots: MenuItem[] = [];
  for (const [id, item] of items) (items.get(parents.get(id) ?? "")?.children ?? roots).push(item);
  const depth = (list: MenuItem[]): number => (list.length ? 1 + Math.max(...list.map((i) => depth(i.children))) : 0);
  if (depth(roots) > MAX_MENU_DEPTH)
    ctx.warn(`menu "${menu.name}" nests ${depth(roots)} levels; the menu editor shows ${MAX_MENU_DEPTH}`);
  return roots;
};

/**
 * Term ids follow the translation group, so every locale's tree uses the same ids. With `split`,
 * a name that bundles several terms ("Business|Press releases") becomes one term per part, merged
 * by slug; split the posts' values the same way with `termSlugs`.
 */
export const termTree = (taxonomy: SourceRecord, ctx: MapContext, options: { split?: boolean } = {}): TermNode[] => {
  const terms = ctx.records(`term:${taxonomy.taxonomy}`, (t) => t.locale === taxonomy.locale);
  const nodes = new Map<number, TermNode>();
  const roots: TermNode[] = [];
  const bySlug = new Map<string, TermNode>();
  for (const t of terms) {
    const parts = options.split ? termParts(decodeEntities(String(t.name))) : [];
    if (parts.length > 1) {
      for (const name of parts) {
        const slug = slugify(name);
        if (!bySlug.has(slug))
          roots.push(bySlug.set(slug, { id: `term-${slug}`, name, slug, children: [] }).get(slug)!);
      }
      continue;
    }
    nodes.set(t.id, {
      id: t.group ? slugify(String(t.group)) : `term-${t.id}`,
      name: decodeEntities(String(t.name)),
      slug: String(t.slug),
      children: [],
    });
  }
  for (const t of terms) {
    const node = nodes.get(t.id);
    if (!node) continue;
    if (bySlug.has(node.slug)) continue;
    bySlug.set(node.slug, node);
    (nodes.get(Number(t.parent))?.children ?? roots).push(node);
  }
  return roots;
};

/** A post's term list → slugs, splitting bundled names like `termTree(…, { split: true })` does. */
export const termSlugs = (terms: unknown, options: { split?: boolean } = {}): string[] => [
  ...new Set(
    (Array.isArray(terms) ? terms : []).flatMap((t: any) => {
      const parts = options.split ? termParts(decodeEntities(String(t.name))) : [];
      return parts.length > 1 ? parts.map((p) => slugify(p)) : [String(t.slug)];
    }),
  ),
];

const FORM_TYPES: Record<string, string> = {
  text: "text",
  email: "email",
  phone: "tel",
  number: "number",
  textarea: "textarea",
  select: "select",
  multiselect: "checkbox",
  radio: "radio",
  checkbox: "checkbox",
  consent: "consent",
  date: "date",
  time: "time",
  fileupload: "file",
  html: "html",
  section: "section",
  website: "text",
  hidden: "text",
};
const CHOICES = new Set(["select", "radio", "checkbox"]);
/** Spam protection and multi-page breaks are the form renderer's job, not fields. */
const SKIPPED_FIELDS = new Set(["captcha", "page"]);

/** Chained Selects: one select per level, each offering every choice that level can show. */
const chainedSelects = (
  f: any,
  common: Record<string, unknown>,
  nameFor: (label: string, id: unknown) => string,
): Record<string, unknown>[] => {
  const levels = f.inputs?.length ? f.inputs : [{ id: f.id, label: f.label }];
  let choices: any[] = f.choices ?? [];
  return levels.map((input: any) => {
    const unique = [...new Map(choices.map((c) => [String(c.text), c])).values()];
    const field = {
      type: "select",
      name: nameFor(String(input.label || f.label), input.id),
      label: String(input.label || f.label),
      ...common,
      options: unique.map((c) => String(c.text)),
      values: unique.map((c) => String(c.value)),
    };
    choices = choices.flatMap((c) => c.choices ?? []);
    return field;
  });
};

/** A Gravity Forms record → the fields of `presets.forms`. Composite fields (name, address) become one field per input. */
export const gravityForm = (src: SourceRecord, ctx: MapContext): Record<string, unknown> => {
  const used = new Set<string>();
  const nameFor = (label: string, id: unknown) => {
    let name = slugify(label) || `field-${id}`;
    if (used.has(name)) name = `${name}-${slugify(String(id))}`;
    used.add(name);
    return name;
  };
  const number = (v: unknown) => (v === "" || v == null ? undefined : Number(v));
  const fields = (src.fields ?? []).flatMap((f: any): Record<string, unknown>[] => {
    if (SKIPPED_FIELDS.has(f.type)) return [];
    const type = FORM_TYPES[f.type];
    const common = { description: f.description ?? "", required: !!f.isRequired };
    if (f.type === "chainedselect") return chainedSelects(f, common, nameFor);
    if (!type && f.inputs?.length)
      return f.inputs.map((i: any) => ({
        type: "text",
        name: nameFor(`${f.label} ${i.label}`, i.id),
        label: `${f.label} – ${i.label}`,
        ...common,
      }));
    if (!type) ctx.warn(`form ${src.id}: Gravity Forms field type "${f.type}" imported as text`);
    const item: Record<string, unknown> = { type: type ?? "text", name: nameFor(String(f.label || f.type), f.id) };
    if (type === "html") return [{ ...item, content: ctx.richText(f.content) }];
    item.label = f.label ?? "";
    if (type === "section") return [{ ...item, description: f.description ?? "" }];
    Object.assign(item, common);
    if (f.placeholder) item.placeholder = f.placeholder;
    if (number(f.maxLength)) item.maxLength = number(f.maxLength);
    if (CHOICES.has(type ?? "")) {
      item.options = (f.choices ?? []).map((c: any) => String(c.text));
      item.values = (f.choices ?? []).map((c: any) => String(c.value));
    }
    // Checkbox and consent inputs mirror their choices (GF sub-input ids).
    for (const i of f.inputs ?? []) touch(i.id, i.label);
    if (type === "consent") item.checkboxLabel = f.checkboxLabel || f.choices?.[0]?.text || "";
    return [item];
  });
  const confirmation = src.confirmation ?? {};
  const redirect =
    confirmation.type === "redirect"
      ? confirmation.url
      : confirmation.type === "page"
        ? ctx.refLink(confirmation.pageId)?.url
        : "";
  return {
    title: src.title,
    slug: slugify(String(src.title)),
    description: src.description ?? "",
    submitLabel: src.button ?? "",
    successMessage: confirmation.type === "message" ? ctx.text(confirmation.message) : "",
    submitRedirect: redirect ?? "",
    notificationEmail: src.notifyEmail ?? "",
    fields,
  };
};
