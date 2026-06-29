/**
 * The canonical model of Kide's field types: what each stores, how the admin
 * renders it, and the exact value shape an importer must write. This is the
 * single source of truth behind `kide describe` (the migration manifest) and the
 * import validator — so agents and humans never have to reverse-engineer the
 * admin to learn "what control will this field show / what do I write into it".
 */
import type { CMSConfig, CollectionConfig, FieldConfig } from "./define";
import { getLabelField, getTranslatableFieldNames } from "./define";

export type FieldModelEntry = {
  /** How the value is persisted: a SQLite column type, or JSON-serialized into one. */
  storage: string;
  /** The admin control rendered for this field type. */
  control: string;
  /** The stored value shape an importer must produce (TypeScript-ish). */
  valueShape: string;
  /** Guidance for importers / migration agents. */
  notes?: string;
};

/** Field type → storage / admin control / value shape. */
export const FIELD_MODEL: Record<string, FieldModelEntry> = {
  text: { storage: "text", control: "text input (textarea when admin.rows set)", valueShape: "string" },
  slug: {
    storage: "text",
    control: "slug input (auto-derives from `from`)",
    valueShape: "string (url-safe)",
    notes: "unique:true by default — set unique:false for hierarchical or per-locale reused slugs.",
  },
  email: { storage: "text", control: "email input", valueShape: "string" },
  number: { storage: "real", control: "number input", valueShape: "number" },
  boolean: { storage: "integer", control: "checkbox", valueShape: "boolean" },
  date: { storage: "text", control: "date input", valueShape: "ISO date string (YYYY-MM-DD or full ISO)" },
  select: { storage: "text", control: "dropdown", valueShape: "string (one of `options`)" },
  color: {
    storage: "text",
    control: "colour swatch picker (brand palette + custom + hex)",
    valueShape: "hex string e.g. '#00BB5F' (empty string = inherit default)",
  },
  richText: {
    storage: "json",
    control: "rich-text editor",
    valueShape: "{ type:'root', children: RichTextNode[] }",
    notes: "Build from HTML with htmlToRichText(html).",
  },
  content: {
    storage: "json",
    control: "content editor (prose + inline component blocks)",
    valueShape: "{ type:'root', children: (RichTextNode | { type:'block', blockType:string, fields:object })[] }",
    notes:
      "Inline block `fields` are NOT validated on write; declare `blocks` so the editor can render them. Stored discriminator is 'block'.",
  },
  image: {
    storage: "text",
    control: "asset picker",
    valueShape: "storagePath string '/uploads/<id>.<ext>'",
    notes: "Upload originals with assets.upload(file, { alt }); store the returned storagePath.",
  },
  link: {
    storage: "json",
    control: "link control (internal page picker / external URL + label + new-tab)",
    valueShape: "{ type:'internal'|'external', url:string, label?:string, newTab?:boolean }",
  },
  relation: {
    storage: "text (json when hasMany)",
    control: "relation picker (single dropdown, or chips + dropdown when hasMany)",
    valueShape: "id string — or id[] when hasMany",
  },
  array: {
    storage: "json",
    control: "array control: image pickers (of:image), comma input (of:text), else JSON",
    valueShape: "Array<value of `of`>",
  },
  json: {
    storage: "json",
    control: "JSON textarea — OR a typed repeater when admin.component:'repeater' (+ itemFields)",
    valueShape: "any — Array<{ ...itemFields }> when used as a typed repeater",
    notes: "For repeating rows of typed fields use admin.component:'repeater' with itemFields.",
  },
  blocks: {
    storage: "json",
    control: "block editor (standalone)",
    valueShape: "Array<{ type:blockType, ...fields }>",
  },
};

/** The rich-text / content AST node schema, surfaced verbatim in the manifest. */
export const CONTENT_AST_SCHEMA = {
  root: "{ type:'root', children: Node[] }",
  nodes: {
    text: "{ type:'text', value:string, bold?:boolean, italic?:boolean, href?:string }",
    paragraph: "{ type:'paragraph', children:Node[] }",
    heading: "{ type:'heading', level:1-6, children:Node[] }",
    list: "{ type:'list', ordered?:boolean, children:ListItem[] }",
    "list-item": "{ type:'list-item', children:Node[] }",
    quote: "{ type:'quote', children:Node[] }",
    image: "{ type:'image', src:string, alt:string }",
    block: "{ type:'block', blockType:string, fields:object }  (content field only — inline component block)",
  },
};

const typeSpecific = (field: FieldConfig): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  if (field.type === "select") out.options = field.options;
  if (field.type === "relation") {
    out.collection = field.collection;
    out.hasMany = field.hasMany ?? false;
  }
  if (field.type === "array") out.of = describeField("of", field.of);
  if (field.type === "json" && field.itemFields) {
    out.itemFields = Object.fromEntries(
      Object.entries(field.itemFields).map(([name, f]) => [name, describeField(name, f)]),
    );
  }
  if (field.type === "content") out.blockTypes = describeBlockTypes(field.blocks);
  if (field.type === "blocks") out.blockTypes = describeBlockTypes(field.types);
  return out;
};

export const describeField = (name: string, field: FieldConfig): Record<string, unknown> => {
  // `color`/`link` are admin.component helpers over text/json — report them as
  // their effective semantic type so the manifest is honest about the control.
  const component = field.admin?.component;
  const effectiveType = component === "color" || component === "link" ? component : field.type;
  const model = FIELD_MODEL[effectiveType] ?? { storage: "json", control: "unknown", valueShape: "unknown" };
  return {
    name,
    type: effectiveType,
    label: field.label,
    required: field.required ?? false,
    translatable: field.translatable ?? false,
    storage: model.storage,
    control: model.control,
    valueShape: model.valueShape,
    ...(model.notes ? { notes: model.notes } : {}),
    ...typeSpecific(field),
  };
};

export const describeBlockTypes = (blocks: Record<string, Record<string, FieldConfig>> | undefined) =>
  blocks
    ? Object.fromEntries(
        Object.entries(blocks).map(([blockType, fieldMap]) => [
          blockType,
          Object.fromEntries(Object.entries(fieldMap).map(([name, f]) => [name, describeField(name, f)])),
        ]),
      )
    : {};

export const describeCollection = (collection: CollectionConfig) => ({
  slug: collection.slug,
  labels: collection.labels,
  labelField: getLabelField(collection),
  table: `cms_${collection.slug}`,
  drafts: collection.drafts ?? false,
  versions: collection.versions ?? null,
  searchable: collection.searchable ?? false,
  translatableFields: getTranslatableFieldNames(collection),
  fields: Object.fromEntries(
    Object.entries(collection.fields).map(([name, field]) => [name, describeField(name, field)]),
  ),
});

/** Build the full machine-readable model manifest from a CMS config. */
export const describeModel = (config: CMSConfig) => ({
  generatedBy: "kide describe",
  locales: config.locales ?? { default: "en", supported: ["en"] },
  fieldTypes: FIELD_MODEL,
  contentAst: CONTENT_AST_SCHEMA,
  collections: config.collections.map(describeCollection),
});
