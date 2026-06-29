/**
 * Migration toolkit: validate documents against the collection schema BEFORE
 * writing (so shape mismatches surface in a report, not by opening the admin and
 * finding raw JSON), load a batch with a dry-run mode, and render the
 * machine-readable model into `MODEL.md`. Pairs with `kide describe`
 * (internals/describe.ts) and `createCmsContext` (internals/context.ts).
 */
import type { CMSConfig, CollectionConfig, FieldConfig } from "./define";
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
    case "date":
      if (Number.isNaN(Date.parse(String(value)))) warnings.push({ field: name, message: "date is not parseable" });
      break;
  }
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
  const declared = new Set(Object.keys(field.blocks ?? {}));
  for (const node of (value as { children?: Array<{ type?: string; blockType?: string }> }).children ?? []) {
    if (node?.type === "block" && node.blockType && !declared.has(node.blockType)) {
      warnings.push({
        field: name,
        message: `inline block '${node.blockType}' is not declared in this field's blocks`,
      });
    }
  }
};

/** Validate a document's fields against its collection schema. */
export const validateDocument = (collection: CollectionConfig, data: Record<string, unknown>): ValidationResult => {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  for (const [name, field] of Object.entries(collection.fields)) {
    validateField(name, field, data[name], errors, warnings);
  }
  for (const key of Object.keys(data)) {
    if (key.startsWith("_")) continue;
    if (!(key in collection.fields)) warnings.push({ field: key, message: "not a declared field (will be ignored)" });
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

type AnyCms = Record<string, any>;

/**
 * Validate then (unless dryRun) create every item via the typed API. Use
 * `{ _system: true, _skipSearch: true }` context for bulk imports and call
 * `reindex()` once afterwards.
 */
export const importDocuments = async (
  cms: AnyCms,
  config: CMSConfig,
  items: ImportItem[],
  options: { dryRun?: boolean; context?: Record<string, unknown> } = {},
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
    const result = validateDocument(collection, item.data);
    if (result.warnings.length) report.warnings.push({ collection: item.collection, id, warnings: result.warnings });
    if (!result.ok) {
      report.invalid.push({ collection: item.collection, id, errors: result.errors });
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
  out.push("> A `content` field stores any `{type:'root'}` doc as-is — inline block `fields` are not");
  out.push("> validated. Build prose with `htmlToRichText(html)`; declare `blocks` for the editor.");
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
