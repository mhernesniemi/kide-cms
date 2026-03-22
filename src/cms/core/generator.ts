import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import config from "../cms.config";
import { getTranslatableFieldNames, type CollectionConfig, type FieldConfig } from "./define";

const generatedDir = path.join(process.cwd(), "src/cms/.generated");

const pascalCase = (value: string) =>
  value
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");

const snakeCase = (value: string) =>
  value
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .toLowerCase();

const isJsonField = (field: FieldConfig) =>
  field.type === "richText" ||
  field.type === "array" ||
  field.type === "json" ||
  field.type === "blocks" ||
  (field.type === "relation" && field.hasMany);

// ---------------------
// schema.ts generation
// ---------------------

const generateColumnDef = (fieldName: string, field: FieldConfig): string => {
  const colName = snakeCase(fieldName);
  let col: string;

  if (field.type === "number") {
    col = `integer("${colName}")`;
  } else if (field.type === "boolean") {
    col = `integer("${colName}", { mode: "boolean" })`;
  } else {
    col = `text("${colName}")`;
  }

  if (field.required && !field.condition) col += ".notNull()";
  if (field.unique) col += ".unique()";
  if (field.defaultValue !== undefined && !isJsonField(field)) {
    if (field.type === "number") {
      col += `.default(${field.defaultValue})`;
    } else if (field.type === "boolean") {
      col += `.default(${field.defaultValue})`;
    } else {
      col += `.default(${JSON.stringify(field.defaultValue)})`;
    }
  }

  return `  ${fieldName}: ${col},`;
};

const generateMainTable = (collection: CollectionConfig): string => {
  const tableName = `cms_${snakeCase(collection.slug)}`;
  const varName = `cms${pascalCase(collection.slug)}`;
  const columns: string[] = [`  _id: text("_id").primaryKey(),`];

  for (const [fieldName, field] of Object.entries(collection.fields)) {
    columns.push(generateColumnDef(fieldName, field));
  }

  if (collection.drafts) {
    columns.push(`  _status: text("_status").notNull().default("draft"),`);
    columns.push(`  _publishedAt: text("_published_at"),`);
    columns.push(`  _publishAt: text("_publish_at"),`);
    columns.push(`  _unpublishAt: text("_unpublish_at"),`);
  }

  if (collection.timestamps !== false) {
    columns.push(`  _createdAt: text("_created_at").notNull(),`);
    columns.push(`  _updatedAt: text("_updated_at").notNull(),`);
  }

  return `export const ${varName} = sqliteTable("${tableName}", {\n${columns.join("\n")}\n});`;
};

const generateTranslationsTable = (collection: CollectionConfig): string | null => {
  if (!config.locales) return null;
  const translatableFields = getTranslatableFieldNames(collection);
  if (translatableFields.length === 0) return null;

  const tableName = `cms_${snakeCase(collection.slug)}_translations`;
  const varName = `cms${pascalCase(collection.slug)}Translations`;
  const mainVar = `cms${pascalCase(collection.slug)}`;

  const columns: string[] = [
    `  _id: text("_id").primaryKey(),`,
    `  _entityId: text("_entity_id").notNull().references(() => ${mainVar}._id, { onDelete: "cascade" }),`,
    `  _languageCode: text("_language_code").notNull(),`,
  ];

  for (const fieldName of translatableFields) {
    const field = collection.fields[fieldName];
    columns.push(generateColumnDef(fieldName, field));
  }

  return `export const ${varName} = sqliteTable("${tableName}", {\n${columns.join("\n")}\n}, (table) => ({\n  uniqueLocale: unique().on(table._entityId, table._languageCode),\n}));`;
};

const generateVersionsTable = (collection: CollectionConfig): string | null => {
  if (!collection.versions) return null;

  const tableName = `cms_${snakeCase(collection.slug)}_versions`;
  const varName = `cms${pascalCase(collection.slug)}Versions`;
  const mainVar = `cms${pascalCase(collection.slug)}`;

  return `export const ${varName} = sqliteTable("${tableName}", {
  _id: text("_id").primaryKey(),
  _docId: text("_doc_id").notNull().references(() => ${mainVar}._id, { onDelete: "cascade" }),
  _version: integer("_version").notNull(),
  _snapshot: text("_snapshot").notNull(),
  _createdAt: text("_created_at").notNull(),
});`;
};

const generateSchemaFile = (): string => {
  const parts: string[] = [
    `// auto-generated — do not edit`,
    `import { sqliteTable, text, integer, real, unique } from "drizzle-orm/sqlite-core";`,
    ``,
  ];

  for (const collection of config.collections) {
    parts.push(generateMainTable(collection));
    const translationsTable = generateTranslationsTable(collection);
    if (translationsTable) parts.push("", translationsTable);
    const versionsTable = generateVersionsTable(collection);
    if (versionsTable) parts.push("", versionsTable);
    parts.push("");
  }

  // System tables
  parts.push(`export const cmsAssets = sqliteTable("cms_assets", {
  _id: text("_id").primaryKey(),
  filename: text("filename").notNull(),
  mimeType: text("mime_type").notNull(),
  size: integer("size").notNull(),
  width: integer("width"),
  height: integer("height"),
  focalX: real("focal_x"),
  focalY: real("focal_y"),
  alt: text("alt"),
  folder: text("folder"),
  storagePath: text("storage_path").notNull(),
  _createdAt: text("_created_at").notNull(),
});`);

  parts.push("");

  parts.push(`export const cmsAssetFolders = sqliteTable("cms_asset_folders", {
  _id: text("_id").primaryKey(),
  name: text("name").notNull(),
  parent: text("parent"),
  _createdAt: text("_created_at").notNull(),
});`);

  parts.push("");

  parts.push(`export const cmsSessions = sqliteTable("cms_sessions", {
  _id: text("_id").primaryKey(),
  userId: text("user_id").notNull(),
  expiresAt: text("expires_at").notNull(),
});`);

  parts.push("");

  parts.push(`export const cmsLocks = sqliteTable("cms_locks", {
  _id: text("_id").primaryKey(),
  collection: text("collection").notNull(),
  documentId: text("document_id").notNull(),
  userId: text("user_id").notNull(),
  userEmail: text("user_email").notNull(),
  lockedAt: text("locked_at").notNull(),
});`);

  parts.push("");

  // Export a lookup of table variables for the API layer
  const tableExports: string[] = [];
  for (const collection of config.collections) {
    const varName = `cms${pascalCase(collection.slug)}`;
    const safeKey = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(collection.slug) ? collection.slug : `"${collection.slug}"`;
    tableExports.push(`  ${safeKey}: { main: ${varName}`);
    const translatableFields = getTranslatableFieldNames(collection);
    if (translatableFields.length > 0 && config.locales) {
      tableExports[tableExports.length - 1] += `, translations: ${varName}Translations`;
    }
    if (collection.versions) {
      tableExports[tableExports.length - 1] += `, versions: ${varName}Versions`;
    }
    tableExports[tableExports.length - 1] += ` },`;
  }
  parts.push(`export const cmsTables = {\n${tableExports.join("\n")}\n};`);

  return parts.join("\n");
};

// -----------------------
// validators.ts generation
// -----------------------

const zodTypeForField = (field: FieldConfig): string => {
  if (
    field.type === "text" ||
    field.type === "slug" ||
    field.type === "email" ||
    field.type === "image" ||
    field.type === "date"
  ) {
    let z = "z.string()";
    if (field.type === "email") z = `z.string().email()`;
    if (field.type === "text" && field.maxLength) z = `z.string().max(${field.maxLength})`;
    return z;
  }
  if (field.type === "number") return "z.number()";
  if (field.type === "boolean") return "z.boolean()";
  if (field.type === "select") {
    return `z.enum([${field.options.map((o) => JSON.stringify(o)).join(", ")}])`;
  }
  if (field.type === "relation") {
    return field.hasMany ? "z.array(z.string())" : "z.string()";
  }
  if (field.type === "array") {
    return `z.array(${zodTypeForField(field.of)})`;
  }
  if (field.type === "richText") {
    return "z.object({ type: z.literal('root'), children: z.array(z.any()) })";
  }
  if (field.type === "json") {
    return "z.record(z.unknown())";
  }
  if (field.type === "blocks") {
    const variants = Object.entries(field.types).map(([blockType, fields]) => {
      const members = Object.entries(fields)
        .map(([fn, f]) => `${fn}: ${zodTypeForField(f)}${f.required ? "" : ".optional()"}`)
        .join(", ");
      return `z.object({ type: z.literal(${JSON.stringify(blockType)}), ${members} })`;
    });
    if (variants.length === 0) return "z.array(z.record(z.unknown()))";
    if (variants.length === 1) return `z.array(${variants[0]})`;
    return `z.array(z.discriminatedUnion("type", [\n    ${variants.join(",\n    ")},\n  ]))`;
  }
  return "z.unknown()";
};

const generateValidatorsFile = (): string => {
  const parts: string[] = [`// auto-generated — do not edit`, `import { z } from "zod";`, ``];

  for (const collection of config.collections) {
    const name = pascalCase(collection.slug);
    const fieldEntries = Object.entries(collection.fields).map(([fieldName, field]) => {
      const zodType = zodTypeForField(field);
      const isOptional = !field.required || !!field.condition;
      return `  ${fieldName}: ${zodType}${isOptional ? ".optional()" : ""},`;
    });

    parts.push(`export const ${name}CreateSchema = z.object({\n${fieldEntries.join("\n")}\n});`);
    parts.push("");

    const partialEntries = Object.entries(collection.fields).map(([fieldName, field]) => {
      const zodType = zodTypeForField(field);
      return `  ${fieldName}: ${zodType}.optional(),`;
    });
    parts.push(`export const ${name}UpdateSchema = z.object({\n${partialEntries.join("\n")}\n});`);
    parts.push("");
  }

  // Export map for runtime access
  const mapEntries = config.collections.map((c) => {
    const name = pascalCase(c.slug);
    return `  ${c.slug}: { create: ${name}CreateSchema, update: ${name}UpdateSchema },`;
  });
  parts.push(`export const validators = {\n${mapEntries.join("\n")}\n};`);

  return parts.join("\n");
};

// ---------------------
// types.ts generation
// ---------------------

const typeForField = (field: FieldConfig): string => {
  if (
    field.type === "text" ||
    field.type === "slug" ||
    field.type === "email" ||
    field.type === "image" ||
    field.type === "date"
  )
    return "string";
  if (field.type === "number") return "number";
  if (field.type === "boolean") return "boolean";
  if (field.type === "select") return field.options.map((o) => JSON.stringify(o)).join(" | ");
  if (field.type === "relation") return field.hasMany ? "string[]" : "string";
  if (field.type === "array") return `${typeForField(field.of)}[]`;
  if (field.type === "richText") return "RichTextDocument";
  if (field.type === "json") return "Record<string, unknown>";
  if (field.type === "blocks") {
    const variants = Object.entries(field.types).map(([blockType, fields]) => {
      const members = Object.entries(fields)
        .map(([fn, f]) => `${fn}${f.required ? "" : "?"}: ${typeForField(f)};`)
        .join(" ");
      return `{ type: ${JSON.stringify(blockType)}; ${members} }`;
    });
    return `Array<${variants.join(" | ")}>`;
  }
  return "unknown";
};

const generateTypesFile = (): string => {
  const parts: string[] = [
    `// auto-generated — do not edit`,
    `import type { RichTextDocument } from "../core/define";`,
    ``,
    `export type CMSCollectionSlug = ${config.collections.map((c) => JSON.stringify(c.slug)).join(" | ")};`,
    ``,
  ];

  for (const collection of config.collections) {
    const docName = `${pascalCase(collection.slug)}Document`;
    const inputName = `${pascalCase(collection.slug)}Input`;
    const translationName = `${pascalCase(collection.slug)}TranslationInput`;
    const translatableFields = getTranslatableFieldNames(collection);

    const fieldEntries = Object.entries(collection.fields)
      .map(([fieldName, field]) => {
        const isOptional = !field.required || !!field.condition;
        return `  ${fieldName}${isOptional ? "?" : ""}: ${typeForField(field)};`;
      })
      .join("\n");

    const translationEntries = translatableFields.length
      ? translatableFields.map((fn) => `  ${fn}?: ${typeForField(collection.fields[fn])};`).join("\n")
      : "  [key: string]: never;";

    parts.push(`export type ${inputName} = {\n${fieldEntries}\n};`);
    parts.push("");
    parts.push(`export type ${translationName} = {\n${translationEntries}\n};`);
    parts.push("");
    parts.push(`export type ${docName} = ${inputName} & {
  _id: string;
  _status: "draft" | "published" | "scheduled";
  _publishedAt?: string | null;
  _publishAt?: string | null;
  _unpublishAt?: string | null;
  _createdAt: string;
  _updatedAt: string;
  _locale?: string | null;
  _availableLocales?: string[];
};`);
    parts.push("");
  }

  parts.push(`export type StoredVersion = {
  version: number;
  createdAt: string;
  snapshot: Record<string, unknown>;
};`);

  return parts.join("\n");
};

// --------------------
// api.ts generation
// --------------------

const generateApiFile = (): string => {
  const imports = config.collections
    .map((c) => {
      const name = pascalCase(c.slug);
      return [`${name}Document`, `${name}Input`, `${name}TranslationInput`];
    })
    .flat();

  const apiTypes = config.collections
    .map((collection) => {
      const baseName = pascalCase(collection.slug);
      const ctx = `context?: { user?: { id: string; role?: string; email?: string } | null }`;
      const apiKey = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(collection.slug) ? collection.slug : `"${collection.slug}"`;
      return `  ${apiKey}: {
    find(options?: import("../core/api").FindOptions, ${ctx}): Promise<${baseName}Document[]>;
    findOne(filter: Record<string, unknown> & { locale?: string; status?: "draft" | "published" | "scheduled" | "any" }, ${ctx}): Promise<${baseName}Document | null>;
    findById(id: string, options?: { locale?: string; status?: "draft" | "published" | "scheduled" | "any" }, ${ctx}): Promise<${baseName}Document | null>;
    create(data: ${baseName}Input, ${ctx}): Promise<${baseName}Document>;
    update(id: string, data: Partial<${baseName}Input>, ${ctx}): Promise<${baseName}Document>;
    delete(id: string, ${ctx}): Promise<void>;
    count(filter?: Omit<import("../core/api").FindOptions, "limit" | "offset" | "sort">, ${ctx}): Promise<number>;
    versions(id: string): Promise<import("./types").StoredVersion[]>;
    restore(id: string, versionNumber: number, ${ctx}): Promise<${baseName}Document>;
    publish(id: string, ${ctx}): Promise<${baseName}Document>;
    unpublish(id: string, ${ctx}): Promise<${baseName}Document>;
    schedule(id: string, publishAt: string, unpublishAt?: string | null, ${ctx}): Promise<${baseName}Document>;
    getTranslations(id: string): Promise<Record<string, ${baseName}TranslationInput>>;
    upsertTranslation(id: string, locale: string, data: ${baseName}TranslationInput, ${ctx}): Promise<${baseName}Document>;
  };`;
    })
    .join("\n");

  return `// auto-generated — do not edit
import access from "../access";
import config from "../cms.config";
import { createCms } from "../core/api";
import hooks from "../hooks";
import type {
  ${imports.map((i) => `${i},`).join("\n  ")}
} from "./types";

export const cms = createCms(config, access, hooks) as ReturnType<typeof createCms> & {
${apiTypes}
};
`;
};

// --------------------
// Run
// --------------------

const run = async () => {
  await mkdir(generatedDir, { recursive: true });
  await Promise.all([
    writeFile(path.join(generatedDir, "schema.ts"), generateSchemaFile(), "utf-8"),
    writeFile(path.join(generatedDir, "types.ts"), generateTypesFile(), "utf-8"),
    writeFile(path.join(generatedDir, "validators.ts"), generateValidatorsFile(), "utf-8"),
    writeFile(path.join(generatedDir, "api.ts"), generateApiFile(), "utf-8"),
  ]);
};

await run();
