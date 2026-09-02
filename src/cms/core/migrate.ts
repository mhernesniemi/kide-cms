/**
 * Migration toolkit: validate documents against the collection schema BEFORE
 * writing (so shape mismatches surface in a report, not by opening the admin and
 * finding raw JSON), load a batch with a dry-run mode, and render the
 * machine-readable model into `MODEL.md`. Pairs with `kide describe`
 * (internals/describe.ts) and `createCmsContext` (internals/context.ts).
 */
import type { CMSConfig, CollectionConfig, FieldConfig } from "./define";
import { getTranslatableFieldNames } from "./define";
import { describeModel, FIELD_MODEL, CONTENT_AST_SCHEMA } from "./field-model";

export type ValidationIssue = { field: string; message: string };
export type ValidationResult = { ok: boolean; errors: ValidationIssue[]; warnings: ValidationIssue[] };

const isEmpty = (v: unknown) => v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
const isRoot = (v: unknown) => !!v && typeof v === "object" && (v as { type?: string }).type === "root";

const validateField = (
  name: string,
  field: FieldConfig,
  value: unknown,
  errors: ValidationIssue[],
  warnings: ValidationIssue[],
) => {
  if (field.required && isEmpty(value) && field.defaultValue === undefined) {
    errors.push({ field: name, message: "required but empty" });
    return;
  }
  if (isEmpty(value)) return;

  switch (field.type) {
    case "number":
      if (typeof value !== "number" && Number.isNaN(Number(value)))
        errors.push({ field: name, message: `expected number, got ${typeof value}` });
      break;
    case "boolean":
      if (typeof value !== "boolean") warnings.push({ field: name, message: "expected boolean" });
      break;
    case "select":
      if (!field.options.includes(String(value)))
        errors.push({ field: name, message: `'${value}' is not one of [${field.options.join(", ")}]` });
      break;
    case "relation":
      if (field.hasMany && !Array.isArray(value))
        errors.push({ field: name, message: "hasMany relation expects an array of ids" });
      if (!field.hasMany && typeof value !== "string")
        errors.push({ field: name, message: "relation expects an id string" });
      break;
    case "image":
      if (typeof value !== "string") errors.push({ field: name, message: "image expects a storagePath string" });
      else if (!value.startsWith("/")) warnings.push({ field: name, message: "image src is not a '/uploads/…' path" });
      break;
    case "array":
      if (!Array.isArray(value)) errors.push({ field: name, message: "expected an array" });
      break;
    case "richText":
      if (!isRoot(value)) errors.push({ field: name, message: "richText expects { type:'root', children:[…] }" });
      break;
    case "content":
      validateContent(name, field, value, errors, warnings);
      break;
    case "json": {
      const component = field.admin?.component;
      if (component === "taxonomy-terms" || component === "menu-items") {
        if (!Array.isArray(value)) errors.push({ field: name, message: `${component} expects an array` });
        else validateTree(name, component, value, warnings);
      } else if (field.itemFields && Array.isArray(value)) validateRows(name, field.itemFields, value, warnings);
      break;
    }
    case "blocks":
      if (!Array.isArray(value)) errors.push({ field: name, message: "blocks expects an array" });
      else validateBlockList(name, field.types, value, warnings);
      break;
    case "date":
      if (Number.isNaN(Date.parse(String(value)))) warnings.push({ field: name, message: "date is not parseable" });
      break;
  }
};

/**
 * Nested shapes (inline/standalone block fields, repeater rows) are stored as
 * the importer wrote them — the API does not re-validate them on save. Check
 * them anyway so a wrong key surfaces in the report instead of as raw JSON in
 * the editor, but as warnings: the top-level document still counts as valid.
 */
const validateShape = (
  prefix: string,
  declared: Record<string, FieldConfig>,
  value: Record<string, unknown>,
  warnings: ValidationIssue[],
) => {
  const nested: ValidationIssue[] = [];
  for (const [key, sub] of Object.entries(declared)) validateField(`${prefix}.${key}`, sub, value[key], nested, nested);
  for (const key of Object.keys(value)) {
    if (!(key in declared)) nested.push({ field: `${prefix}.${key}`, message: "not a declared field" });
  }
  warnings.push(...nested);
};

const validateRows = (
  name: string,
  itemFields: Record<string, FieldConfig>,
  rows: unknown[],
  warnings: ValidationIssue[],
) => {
  rows.forEach((row, i) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      warnings.push({ field: `${name}[${i}]`, message: "repeater row expects an object" });
      return;
    }
    validateShape(`${name}[${i}]`, itemFields, row as Record<string, unknown>, warnings);
  });
};

const TREE_ITEM_KEYS = {
  "taxonomy-terms": ["name", "slug"],
  "menu-items": ["label", "href"],
} as const;

/** Tree editors (menus, taxonomy terms) need `id` + `children` on every node. */
const validateTree = (
  prefix: string,
  component: keyof typeof TREE_ITEM_KEYS,
  items: unknown[],
  warnings: ValidationIssue[],
) => {
  items.forEach((item, i) => {
    const at = `${prefix}[${i}]`;
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      warnings.push({ field: at, message: "tree item expects an object" });
      return;
    }
    const node = item as Record<string, unknown>;
    for (const key of ["id", ...TREE_ITEM_KEYS[component]]) {
      if (typeof node[key] !== "string" || !node[key])
        warnings.push({ field: `${at}.${key}`, message: "expected a string" });
    }
    if (!Array.isArray(node.children)) {
      warnings.push({ field: `${at}.children`, message: "expected an array (use [] for a leaf)" });
      return;
    }
    validateTree(`${at}.children`, component, node.children, warnings);
  });
};

const validateBlockList = (
  name: string,
  types: Record<string, Record<string, FieldConfig>>,
  blocks: unknown[],
  warnings: ValidationIssue[],
) => {
  blocks.forEach((block, i) => {
    const { type, ...fields } = (block ?? {}) as { type?: string } & Record<string, unknown>;
    if (!type || !(type in types)) {
      warnings.push({ field: `${name}[${i}]`, message: `block type '${type}' is not declared in this field's types` });
      return;
    }
    validateShape(`${name}[${i}]<${type}>`, types[type], fields, warnings);
  });
};

const validateContent = (
  name: string,
  field: Extract<FieldConfig, { type: "content" }>,
  value: unknown,
  errors: ValidationIssue[],
  warnings: ValidationIssue[],
) => {
  if (!isRoot(value)) {
    errors.push({ field: name, message: "content expects { type:'root', children:[…] }" });
    return;
  }
  const declared = field.blocks ?? {};
  const children = (value as { children?: Array<{ type?: string; blockType?: string; fields?: unknown }> }).children;
  (children ?? []).forEach((node, i) => {
    if (node?.type !== "block" || !node.blockType) return;
    if (!(node.blockType in declared)) {
      warnings.push({
        field: name,
        message: `inline block '${node.blockType}' is not declared in this field's blocks`,
      });
      return;
    }
    const fields = node.fields && typeof node.fields === "object" ? (node.fields as Record<string, unknown>) : {};
    validateShape(`${name}[${i}]<${node.blockType}>`, declared[node.blockType], fields, warnings);
  });
};

/** Validate a document's fields against its collection schema. */
export const validateDocument = (
  collection: CollectionConfig,
  data: Record<string, unknown>,
  config?: CMSConfig,
): ValidationResult => {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  for (const [name, field] of Object.entries(collection.fields)) {
    validateField(name, field, data[name], errors, warnings);
  }
  if (data._sourceLocale !== undefined && data._sourceLocale !== null && data._sourceLocale !== "") {
    const locale = String(data._sourceLocale);
    if (!config?.locales) errors.push({ field: "_sourceLocale", message: "no locales configured" });
    else if (!config.locales.supported.includes(locale))
      errors.push({ field: "_sourceLocale", message: `'${locale}' is not in locales.supported` });
    else if (getTranslatableFieldNames(collection).length === 0)
      warnings.push({ field: "_sourceLocale", message: "collection has no translatable fields (ignored)" });
  }
  for (const key of Object.keys(data)) {
    if (key.startsWith("_")) continue;
    if (!(key in collection.fields)) warnings.push({ field: key, message: "not a declared field (will be ignored)" });
  }
  return { ok: errors.length === 0, errors, warnings };
};

/**
 * Validate an import item's per-locale overlays. Translation tables only exist
 * for fields marked `translatable: true`, and `upsertTranslation` silently drops
 * everything else — so catch both here, before the base document is written.
 */
export const validateTranslations = (
  config: CMSConfig,
  collection: CollectionConfig,
  translations: Record<string, Record<string, unknown>> | undefined,
  sourceLocale?: unknown,
): ValidationResult => {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const locales = Object.keys(translations ?? {});
  if (locales.length === 0) return { ok: true, errors, warnings };

  const translatable = new Set(getTranslatableFieldNames(collection));
  if (!config.locales || translatable.size === 0) {
    errors.push({
      field: "translations",
      message: !config.locales
        ? "no locales configured (set `locales` in cms.config.ts)"
        : `collection has no translatable fields (mark them \`translatable: true\`, then cms:generate + cms:push)`,
    });
    return { ok: false, errors, warnings };
  }

  const base = sourceLocale ? String(sourceLocale) : config.locales.default;
  for (const locale of locales) {
    const prefix = `translations.${locale}`;
    if (locale === base) {
      errors.push({ field: prefix, message: `'${locale}' is the document's content language — put it in \`data\`` });
      continue;
    }
    if (!config.locales.supported.includes(locale)) {
      errors.push({ field: prefix, message: `'${locale}' is not in locales.supported` });
      continue;
    }
    const overlay = translations![locale] ?? {};
    const keys = Object.keys(overlay).filter((k) => !k.startsWith("_"));
    const kept = keys.filter((k) => translatable.has(k));
    for (const key of keys) {
      if (!translatable.has(key))
        warnings.push({ field: `${prefix}.${key}`, message: "not a translatable field (will be dropped)" });
    }
    if (keys.length && kept.length === 0) {
      errors.push({
        field: prefix,
        message: "none of these fields are translatable — the whole translation would be dropped",
      });
      continue;
    }
    for (const key of kept) validateField(`${prefix}.${key}`, collection.fields[key], overlay[key], errors, warnings);
  }
  return { ok: errors.length === 0, errors, warnings };
};

// ---------------------------------------------------------------------------
// Batch loader (import IR → CMS) with dry-run + validation report.
// ---------------------------------------------------------------------------

export type ImportItem = {
  collection: string;
  /** Base-locale fields. Pass `_id` for deterministic, re-runnable imports. */
  data: Record<string, unknown>;
  /** Optional per-locale translatable-field overlays. */
  translations?: Record<string, Record<string, unknown>>;
};

export type ImportReport = {
  dryRun: boolean;
  total: number;
  created: number;
  translated: number;
  failed: number;
  invalid: Array<{ collection: string; id: unknown; errors: ValidationIssue[] }>;
  warnings: Array<{ collection: string; id: unknown; warnings: ValidationIssue[] }>;
  errors: Array<{ collection: string; id: unknown; message: string }>;
};

/** Thrown by a real (non-dry) import run that had failures. Carries the full report. */
export class ImportFailedError extends Error {
  report: ImportReport;
  constructor(report: ImportReport) {
    const first = report.errors[0]?.message ?? report.invalid[0]?.errors[0]?.message ?? "see report";
    super(`Import failed for ${report.failed} of ${report.total} documents (first: ${first})`);
    this.name = "ImportFailedError";
    this.report = report;
  }
}

type AnyCms = Record<string, any>;

/**
 * Validate then (unless dryRun) create every item via the typed API. Use
 * `{ _system: true, _skipSearch: true }` context for bulk imports and call
 * `reindex()` once afterwards.
 *
 * A real run throws ImportFailedError when any document fails, so a half-applied
 * import can't look like success; pass `throwOnFailed: false` to get the report
 * back instead. Dry runs always return the report.
 */
export const importDocuments = async (
  cms: AnyCms,
  config: CMSConfig,
  items: ImportItem[],
  options: { dryRun?: boolean; throwOnFailed?: boolean; context?: Record<string, unknown> } = {},
): Promise<ImportReport> => {
  const dryRun = options.dryRun ?? false;
  const context = options.context ?? { _system: true, _skipSearch: true };
  const collectionMap = Object.fromEntries(config.collections.map((c) => [c.slug, c]));
  const report: ImportReport = {
    dryRun,
    total: items.length,
    created: 0,
    translated: 0,
    failed: 0,
    invalid: [],
    warnings: [],
    errors: [],
  };

  for (const item of items) {
    const collection = collectionMap[item.collection];
    const id = item.data._id;
    if (!collection) {
      report.errors.push({ collection: item.collection, id, message: "unknown collection" });
      report.failed++;
      continue;
    }
    const doc = validateDocument(collection, item.data, config);
    const i18n = validateTranslations(config, collection, item.translations, item.data._sourceLocale);
    const warnings = [...doc.warnings, ...i18n.warnings];
    const errors = [...doc.errors, ...i18n.errors];
    if (warnings.length) report.warnings.push({ collection: item.collection, id, warnings });
    if (errors.length) {
      report.invalid.push({ collection: item.collection, id, errors });
      report.failed++;
      continue;
    }
    if (dryRun) continue;
    try {
      const created = await cms[item.collection].create(item.data, context);
      report.created++;
      for (const [locale, overlay] of Object.entries(item.translations ?? {})) {
        await cms[item.collection].upsertTranslation(created._id, locale, overlay, context);
        report.translated++;
      }
    } catch (e) {
      report.errors.push({ collection: item.collection, id, message: (e as Error).message });
      report.failed++;
    }
  }
  if (!dryRun && report.failed > 0 && (options.throwOnFailed ?? true)) throw new ImportFailedError(report);
  return report;
};

// ---------------------------------------------------------------------------
// MODEL.md renderer
// ---------------------------------------------------------------------------

const table = (headers: string[], rows: string[][]) =>
  [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((r) => `| ${r.map((c) => c.replace(/\|/g, "\\|")).join(" | ")} |`),
  ].join("\n");

const fieldRow = (f: Record<string, unknown>): string[] => {
  const extra: string[] = [];
  if (f.options) extra.push(`options: ${(f.options as string[]).join(", ")}`);
  if (f.collection) extra.push(`→ ${f.collection}${f.hasMany ? "[]" : ""}`);
  if (f.itemFields) extra.push(`rows: ${Object.keys(f.itemFields as object).join(", ")}`);
  if (f.blockTypes) extra.push(`blocks: ${Object.keys(f.blockTypes as object).join(", ")}`);
  return [
    `\`${f.name}\``,
    String(f.type),
    String(f.control),
    f.required ? "yes" : "",
    f.translatable ? "yes" : "",
    `\`${f.valueShape}\`${extra.length ? " — " + extra.join("; ") : ""}`,
  ];
};

/** Render the model manifest as human/agent-readable Markdown (MODEL.md). */
export const renderModelMarkdown = (config: CMSConfig): string => {
  const model = describeModel(config);
  const out: string[] = [];
  out.push("# Kide content model");
  out.push("");
  out.push("> Generated by `pnpm cms:describe`. The authoritative map of every collection, field, its");
  out.push("> admin control and the exact value shape an importer must write. Do not edit by hand.");
  out.push("");
  out.push(`**Locales:** default \`${model.locales.default}\`, supported \`${model.locales.supported.join(", ")}\``);
  out.push("");
  out.push("> The **i18n** column is `yes` only for fields declared `translatable: true`. Only those");
  out.push("> fields accept per-locale values (`translations` in an import item, `upsertTranslation`);");
  out.push("> everything else is base-locale only. A collection with no `yes` has no translation table.");
  out.push(`> Every document has \`_sourceLocale\` — the language its base row is written in (default`);
  out.push(`> \`${model.locales.default}\`). A document exists in its source locale plus every locale it has a`);
  out.push(
    "> translation for; content that only exists in one language is a base doc in that language with no overlay.",
  );
  out.push("");

  out.push("## Field types");
  out.push("");
  out.push(
    table(
      ["type", "storage", "admin control", "value shape"],
      Object.entries(FIELD_MODEL).map(([t, m]) => [`\`${t}\``, m.storage, m.control, `\`${m.valueShape}\``]),
    ),
  );
  out.push("");

  out.push("## Content / rich-text AST");
  out.push("");
  out.push("```");
  out.push(`root: ${CONTENT_AST_SCHEMA.root}`);
  for (const [k, v] of Object.entries(CONTENT_AST_SCHEMA.nodes)) out.push(`  ${k}: ${v}`);
  out.push("```");
  out.push("> A `content` field stores any `{type:'root'}` doc as-is — the API does not check inline");
  out.push("> block `fields` on save, but `load({ dryRun: true })` reports mismatches as warnings.");
  out.push("> Build prose with `htmlToRichText(html)`; declare `blocks` for the editor.");
  out.push("");

  for (const collection of model.collections) {
    out.push(`## Collection: \`${collection.slug}\` — ${collection.labels.plural}`);
    out.push("");
    const flags = [
      collection.drafts ? "drafts" : null,
      collection.versions ? "versioned" : null,
      collection.searchable ? "searchable" : null,
    ].filter(Boolean);
    out.push(
      `Table \`${collection.table}\` · label field \`${collection.labelField}\`${flags.length ? " · " + flags.join(", ") : ""}`,
    );
    out.push("");
    out.push(
      table(
        ["field", "type", "control", "req", "i18n", "value shape"],
        Object.values(collection.fields).map((f) => fieldRow(f as Record<string, unknown>)),
      ),
    );
    out.push("");

    // Inline / block registries
    for (const f of Object.values(collection.fields) as Array<Record<string, unknown>>) {
      if (!f.blockTypes) continue;
      out.push(`### \`${f.name}\` block types`);
      out.push("");
      for (const [blockType, fieldMap] of Object.entries(f.blockTypes as Record<string, Record<string, unknown>>)) {
        const sub = Object.values(fieldMap).map(
          (sf) => `${(sf as { name: string }).name}: ${(sf as { type: string }).type}`,
        );
        out.push(`- **${blockType}** — ${sub.join(", ")}`);
      }
      out.push("");
    }
  }
  return out.join("\n");
};
