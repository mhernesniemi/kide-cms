/**
 * Ready-made collections the admin and the WordPress importer already know by slug (forms,
 * form-submissions, menus, taxonomies, redirects) and the standard content blocks the importer
 * converts core Gutenberg blocks into. Spread and extend them like any collection definition.
 */
import { defineCollection, fields, type FieldConfig } from "./define";

type BlockFields = Record<string, FieldConfig>;

const table: BlockFields = {
  caption: fields.text(),
  headerRow: fields.boolean({ label: "First row is a header" }),
  rows: fields.json({
    admin: { component: "repeater" },
    itemFields: { cells: fields.text({ admin: { help: "Cells separated by |" } }) },
  }),
};
const video: BlockFields = {
  file: fields.image({ label: "Video file" }),
  autoplay: fields.boolean(),
  caption: fields.text(),
};
const audio: BlockFields = { file: fields.image({ label: "Audio file" }), caption: fields.text() };
const embed: BlockFields = { url: fields.text({ required: true }) };
const code: BlockFields = { language: fields.text(), code: fields.text({ admin: { rows: 10 } }) };
const html: BlockFields = { code: fields.text({ admin: { rows: 8, help: "Raw HTML/embed code, rendered as is" } }) };
/** Needs `presets.forms` in the config. */
const form: BlockFields = {
  form: fields.relation({ collection: "forms", required: true }),
  showTitle: fields.boolean(),
  showDescription: fields.boolean(),
};

/**
 * The blocks the WordPress importer converts core blocks into: accordion, table, video, audio, embed,
 * code and html, plus `form` with `{ forms: true }` (needs `presets.forms`). Accordion panels accept the
 * same blocks and any `panelBlocks` you add.
 */
export const standardBlocks = (options: { forms?: boolean; panelBlocks?: Record<string, BlockFields> } = {}) => {
  const blocks = { table, video, audio, embed, code, html, ...(options.forms ? { form } : {}) };
  return {
    accordion: {
      title: fields.text(),
      body: fields.blocks({
        shared: false,
        types: { text: { body: fields.richText() }, ...blocks, ...options.panelBlocks },
      }),
    },
    ...blocks,
  };
};

const formField = {
  name: fields.text({ required: true, admin: { help: "Field name used in form data (e.g. name)" } }),
  label: fields.text({ required: true }),
  description: fields.text(),
  required: fields.boolean(),
};
const withPlaceholder = { ...formField, placeholder: fields.text() };
const choiceField = {
  ...formField,
  options: fields.array({ of: fields.text(), defaultValue: [] }),
  values: fields.array({
    of: fields.text(),
    defaultValue: [],
    admin: { help: "Values submitted instead of the labels (e.g. integration codes), in option order." },
  }),
};

const forms = defineCollection({
  slug: "forms",
  labels: { singular: "Form", plural: "Forms" },
  labelField: "title",
  linkable: false,
  timestamps: true,
  views: { list: { columns: ["title", "slug", "_updatedAt"] } },
  fields: {
    title: fields.text({ required: true }),
    slug: fields.slug({ from: "title", admin: { position: "sidebar" } }),
    description: fields.text({ admin: { rows: 2 } }),
    submitLabel: fields.text(),
    submitRedirect: fields.text({
      admin: { help: "Optional URL to redirect to after submit. Leave empty to stay on the page." },
    }),
    successMessage: fields.text({ defaultValue: "Thanks — we got your message.", admin: { rows: 2 } }),
    notificationEmail: fields.email({
      admin: { position: "sidebar", help: "Send an email here on each submission (requires RESEND_API_KEY)." },
    }),
    fields: fields.blocks({
      shared: false,
      types: {
        text: { ...withPlaceholder, maxLength: fields.number() },
        email: withPlaceholder,
        textarea: { ...withPlaceholder, maxLength: fields.number(), rows: fields.number({ defaultValue: 4 }) },
        tel: withPlaceholder,
        number: { ...withPlaceholder, min: fields.number(), max: fields.number() },
        date: formField,
        time: formField,
        select: { ...choiceField, placeholder: fields.text() },
        radio: choiceField,
        checkbox: choiceField,
        consent: { ...formField, checkboxLabel: fields.text() },
        file: formField,
        html: { name: fields.text({ required: true }), content: fields.richText() },
        section: { name: fields.text({ required: true }), label: fields.text(), description: fields.text() },
      },
    }),
  },
});

const formSubmissions = defineCollection({
  slug: "form-submissions",
  labels: { singular: "Submission", plural: "Submissions" },
  labelField: "label",
  timestamps: true,
  admin: { group: "Library", icon: "Inbox", weight: 45 },
  access: { create: () => false },
  views: { list: { columns: ["label", "form", "_createdAt", "status"] } },
  fields: {
    label: fields.text({ admin: { hidden: true } }),
    form: fields.relation({ collection: "forms", required: true }),
    status: fields.select({
      options: ["new", "read", "archived"],
      defaultValue: "new",
      admin: { position: "sidebar" },
    }),
    data: fields.json({ access: { update: () => false }, admin: { help: "Submitted form data (read-only)." } }),
  },
  hooks: {
    beforeCreate(data) {
      if (!data.label) {
        const submitted = (data.data ?? {}) as Record<string, unknown>;
        const first = Object.values(submitted).find((v) => typeof v === "string" && v.trim()) as string | undefined;
        data.label = first ? first.slice(0, 40) : "Submission";
      }
      return data;
    },
  },
});

// The tree editor caps nesting (root → section → link); this hook rejects deeper saves made through the API.
const MENU_MAX_DEPTH = 2;
const assertMenuDepth = (items: unknown, depth = 0): void => {
  if (!Array.isArray(items)) return;
  for (const item of items as Array<{ id?: unknown; label?: unknown; children?: unknown }>) {
    if (depth >= MENU_MAX_DEPTH && Array.isArray(item.children) && item.children.length > 0)
      throw new Error(
        `Menu items may only nest ${MENU_MAX_DEPTH + 1} levels deep (root → section → link) — "${String(item.label ?? item.id ?? "item")}" has a child that would never render.`,
      );
    assertMenuDepth(item.children, depth + 1);
  }
};

const menus = defineCollection({
  slug: "menus",
  labels: { singular: "Menu", plural: "Menus" },
  timestamps: true,
  views: { list: { columns: ["name", "slug", "_updatedAt"] } },
  fields: {
    name: fields.text({ required: true, translatable: true }),
    slug: fields.slug({ from: "name", admin: { position: "sidebar" } }),
    items: fields.json({ translatable: true, admin: { component: "menu-items" } }),
  },
  hooks: {
    beforeCreate(data) {
      if (data.items !== undefined) assertMenuDepth(data.items);
      return data;
    },
    beforeUpdate(data) {
      if (data.items !== undefined) assertMenuDepth(data.items);
      return data;
    },
    afterCreate(_doc, context) {
      context.cache?.invalidate({ tags: ["menus"] });
    },
    afterUpdate(_doc, context) {
      context.cache?.invalidate({ tags: ["menus"] });
    },
    afterDelete(_doc, context) {
      context.cache?.invalidate({ tags: ["menus"] });
    },
  },
});

const taxonomies = defineCollection({
  slug: "taxonomies",
  labels: { singular: "Taxonomy", plural: "Taxonomies" },
  timestamps: true,
  views: { list: { columns: ["name", "slug", "_updatedAt"] } },
  fields: {
    name: fields.text({ required: true }),
    slug: fields.slug({ from: "name", admin: { position: "sidebar" } }),
    terms: fields.json({ translatable: true, admin: { component: "taxonomy-terms" } }),
  },
});

const redirects = defineCollection({
  slug: "redirects",
  labels: { singular: "Redirect", plural: "Redirects" },
  labelField: "from",
  linkable: false,
  timestamps: true,
  admin: { group: "Library", icon: "Signpost", weight: 50 },
  views: { list: { columns: ["from", "to", "code", "_updatedAt"] } },
  fields: {
    from: fields.text({ required: true, unique: true, admin: { help: "Path to redirect, e.g. /old-page/" } }),
    to: fields.text({ required: true }),
    code: fields.select({ options: ["301", "302", "307", "308"], defaultValue: "301" }),
    regex: fields.boolean({ admin: { help: "Treat From as a regular expression." } }),
  },
});

export const presets = { forms, formSubmissions, menus, taxonomies, redirects };
