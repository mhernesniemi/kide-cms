import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

import type { CMSConfig, CollectionConfig, FieldConfig } from "./define";
import { getTranslatableFieldNames } from "./define";

type GeneratorOptions = {
  outputDir: string;
  coreImportPath?: string;
  runtimeImportPath?: string;
  configImportPath?: string;
};

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
  field.type === "content" ||
  field.type === "array" ||
  field.type === "json" ||
  field.type === "blocks" ||
  (field.type === "relation" && field.hasMany);

const generateColumnDef = (fieldName: string, field: FieldConfig, options: { bare?: boolean } = {}): string => {
  const colName = snakeCase(fieldName);
  let col: string;

  if (field.type === "number") {
    col = `integer("${colName}")`;
  } else if (field.type === "boolean") {
    col = `integer("${colName}", { mode: "boolean" })`;
  } else {
    col = `text("${colName}")`;
  }

  // Translations rows are a sparse overlay (readers skip null): every column
  // stays nullable, un-unique, and default-free regardless of the field config.
  if (!options.bare) {
    if (field.required && !field.condition) col += ".notNull()";
    if (field.unique) col += ".unique()";
    if (field.defaultValue !== undefined && !isJsonField(field)) {
      if (field.type === "number" || field.type === "boolean") {
        col += `.default(${field.defaultValue})`;
      } else {
        col += `.default(${JSON.stringify(field.defaultValue)})`;
      }
    }
  }

  return `  ${fieldName}: ${col},`;
};

const generateMainTable = (config: CMSConfig, collection: CollectionConfig): string => {
  const tableName = `cms_${snakeCase(collection.slug)}`;
  const varName = `cms${pascalCase(collection.slug)}`;
  const columns: string[] = [`  _id: text("_id").primaryKey(),`];

  for (const [fieldName, field] of Object.entries(collection.fields)) {
    columns.push(generateColumnDef(fieldName, field));
  }

  // The language the base row is written in. A document exists in this locale
  // plus every locale it has a translation row for; the default keeps existing
  // rows on today's "base row = default locale" behaviour.
  if (config.locales && getTranslatableFieldNames(collection).length > 0) {
    columns.push(
      `  _sourceLocale: text("_source_locale").notNull().default(${JSON.stringify(config.locales.default)}),`,
    );
  }

  if (collection.drafts) {
    columns.push(`  _status: text("_status").notNull().default("draft"),`);
    columns.push(`  _publishedAt: text("_published_at"),`);
    columns.push(`  _publishAt: text("_publish_at"),`);
    columns.push(`  _unpublishAt: text("_unpublish_at"),`);
    columns.push(`  _published: text("_published"),`);
  }

  if (collection.timestamps !== false) {
    columns.push(`  _createdAt: text("_created_at").notNull(),`);
    columns.push(`  _updatedAt: text("_updated_at").notNull(),`);
  }

  // scheduled.processPublishing() sweeps every drafts-enabled collection on each
  // cron tick, filtering on _status plus the due timestamp. Without these it is a
  // full table scan per collection, per tick.
  const indexes: string[] = [];
  const idxPrefix = snakeCase(collection.slug);
  if (collection.drafts) {
    indexes.push(`  publishIdx: index("${idxPrefix}_publish_idx").on(table._status, table._publishAt),`);
    indexes.push(`  unpublishIdx: index("${idxPrefix}_unpublish_idx").on(table._status, table._unpublishAt),`);
  }
  // The admin lists, the Recent view and most editorial listings sort by
  // _updatedAt; without an index each of them is a full scan plus a temp
  // sort per collection, per request — noticeable from a few thousand rows.
  if (collection.timestamps !== false) {
    indexes.push(`  updatedIdx: index("${idxPrefix}_updated_idx").on(table._updatedAt),`);
  }

  const body = `{\n${columns.join("\n")}\n}`;
  if (indexes.length === 0) return `export const ${varName} = sqliteTable("${tableName}", ${body});`;
  return `export const ${varName} = sqliteTable("${tableName}", ${body}, (table) => ({\n${indexes.join("\n")}\n}));`;
};

const generateTranslationsTable = (config: CMSConfig, collection: CollectionConfig): string | null => {
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
    columns.push(generateColumnDef(fieldName, collection.fields[fieldName], { bare: true }));
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

const generateSchemaFile = (config: CMSConfig): string => {
  const parts: string[] = [
    `// auto-generated — do not edit`,
    `import { sqliteTable, text, integer, real, unique, index, primaryKey } from "drizzle-orm/sqlite-core";`,
    ``,
  ];

  for (const collection of config.collections) {
    parts.push(generateMainTable(config, collection));
    const translationsTable = generateTranslationsTable(config, collection);
    if (translationsTable) parts.push("", translationsTable);
    const versionsTable = generateVersionsTable(collection);
    if (versionsTable) parts.push("", versionsTable);
    parts.push("");
  }

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
  hash: text("hash"),
  _createdAt: text("_created_at").notNull(),
}, (table) => ({
  storagePathIdx: index("assets_storage_path_idx").on(table.storagePath),
  hashIdx: index("assets_hash_idx").on(table.hash),
  folderIdx: index("assets_folder_idx").on(table.folder),
}));`);
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
}, (table) => ({
  docIdx: index("locks_doc_idx").on(table.collection, table.documentId),
}));`);
  parts.push("");
  parts.push(`export const cmsInvites = sqliteTable("cms_invites", {
  _id: text("_id").primaryKey(),
  userId: text("user_id").notNull(),
  token: text("token").notNull().unique(),
  expiresAt: text("expires_at").notNull(),
  usedAt: text("used_at"),
});`);
  parts.push("");
  parts.push(`export const cmsPasswordResets = sqliteTable("cms_password_resets", {
  _id: text("_id").primaryKey(),
  userId: text("user_id").notNull(),
  token: text("token").notNull().unique(),
  expiresAt: text("expires_at").notNull(),
  usedAt: text("used_at"),
});`);
  parts.push("");
  parts.push(`export const cmsRateLimits = sqliteTable("cms_rate_limits", {
  _id: text("_id").primaryKey(),
  windowStart: integer("window_start").notNull(),
  count: integer("count").notNull(),
  expiresAt: integer("expires_at").notNull(),
}, (table) => ({
  expiryIdx: index("rate_limits_expiry_idx").on(table.expiresAt),
}));`);
  parts.push("");
  parts.push(`export const cmsAuditLog = sqliteTable("cms_audit_log", {
  _id: text("_id").primaryKey(),
  timestamp: integer("timestamp").notNull(),
  actorId: text("actor_id"),
  actorEmail: text("actor_email"),
  actorRole: text("actor_role"),
  action: text("action").notNull(),
  resourceType: text("resource_type").notNull(),
  resourceCollection: text("resource_collection"),
  resourceId: text("resource_id"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
}, (table) => ({
  timestampIdx: index("audit_timestamp_idx").on(table.timestamp),
  actorIdx: index("audit_actor_idx").on(table.actorId),
  resourceIdx: index("audit_resource_idx").on(table.resourceType, table.resourceCollection, table.resourceId),
}));`);
  parts.push("");
  parts.push(`export const cmsOutbox = sqliteTable("cms_outbox", {
  _id: text("_id").primaryKey(),
  type: text("type").notNull(),
  payload: text("payload"),
  status: text("status").notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(5),
  nextAttemptAt: integer("next_attempt_at").notNull(),
  dedupeKey: text("dedupe_key"),
  lastError: text("last_error"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, (table) => ({
  dueIdx: index("outbox_due_idx").on(table.status, table.nextAttemptAt),
  dedupeIdx: index("outbox_dedupe_idx").on(table.dedupeKey),
}));`);
  parts.push("");
  parts.push(`export const cmsCollaboration = sqliteTable("cms_collaboration", {
  collection: text("collection").notNull(),
  documentId: text("document_id").notNull(),
  reviewState: text("review_state").notNull(),
  editor: text("editor"),
  updatedAt: text("updated_at").notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.collection, table.documentId] }),
  editorIdx: index("collaboration_editor_idx").on(table.editor),
  reviewStateIdx: index("collaboration_review_state_idx").on(table.reviewState),
}));`);
  parts.push("");
  parts.push(`export const cmsComments = sqliteTable("cms_comments", {
  _id: text("_id").primaryKey(),
  collection: text("collection").notNull(),
  documentId: text("document_id").notNull(),
  field: text("field"),
  body: text("body").notNull(),
  authorId: text("author_id"),
  authorEmail: text("author_email"),
  resolved: integer("resolved", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
  editedAt: text("edited_at"),
}, (table) => ({
  docIdx: index("comments_doc_idx").on(table.collection, table.documentId),
}));`);
  parts.push("");

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

const zodTypeForField = (field: FieldConfig): string => {
  if (["text", "slug", "email", "image", "date"].includes(field.type)) {
    let zodType = "z.string()";
    if (field.type === "email") zodType = "z.string().email()";
    if (field.type === "text" && field.maxLength) zodType = `z.string().max(${field.maxLength})`;
    return zodType;
  }
  if (field.type === "number") return "z.number()";
  if (field.type === "boolean") return "z.boolean()";
  if (field.type === "select") return `z.enum([${field.options.map((option) => JSON.stringify(option)).join(", ")}])`;
  if (field.type === "relation") {
    if (!field.hasMany) return "z.string()";
    return field.maxItems ? `z.array(z.string()).max(${field.maxItems})` : "z.array(z.string())";
  }
  if (field.type === "array") {
    const inner = `z.array(${zodTypeForField(field.of)})`;
    return field.maxItems ? `${inner}.max(${field.maxItems})` : inner;
  }
  if (field.type === "richText" || field.type === "content")
    return "z.object({ type: z.literal('root'), children: z.array(z.any()) })";
  if (field.type === "json") return "z.record(z.unknown())";
  if (field.type === "blocks") {
    const allowShared = field.shared !== false;
    const sharedVariant =
      'z.object({ type: z.literal("__shared"), ref: z.string(), title: z.string().optional(), blockType: z.string().optional() })';
    const variants = Object.entries(field.types).map(([blockType, fields]) => {
      const members = Object.entries(fields)
        .map(
          ([fieldName, nestedField]) =>
            `${fieldName}: ${zodTypeForField(nestedField)}${nestedField.required ? "" : ".optional()"}`,
        )
        .join(", ");
      return `z.object({ type: z.literal(${JSON.stringify(blockType)}), ${members} })`;
    });
    if (!allowShared) {
      if (variants.length === 0) return "z.array(z.record(z.unknown()))";
      if (variants.length === 1) return `z.array(${variants[0]})`;
      return `z.array(z.discriminatedUnion("type", [\n    ${variants.join(",\n    ")},\n  ]))`;
    }
    if (variants.length === 0) return `z.array(${sharedVariant})`;
    if (variants.length === 1)
      return `z.array(z.discriminatedUnion("type", [\n    ${sharedVariant},\n    ${variants[0]},\n  ]))`;
    return `z.array(z.discriminatedUnion("type", [\n    ${sharedVariant},\n    ${variants.join(",\n    ")},\n  ]))`;
  }
  return "z.unknown()";
};

const generateValidatorsFile = (config: CMSConfig): string => {
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

  const mapEntries = config.collections.map((collection) => {
    const name = pascalCase(collection.slug);
    return `  "${collection.slug}": { create: ${name}CreateSchema, update: ${name}UpdateSchema },`;
  });
  parts.push(`export const validators = {\n${mapEntries.join("\n")}\n};`);

  return parts.join("\n");
};

const typeForField = (field: FieldConfig): string => {
  if (["text", "slug", "email", "image", "date"].includes(field.type)) return "string";
  if (field.type === "number") return "number";
  if (field.type === "boolean") return "boolean";
  if (field.type === "select") return field.options.map((option) => JSON.stringify(option)).join(" | ");
  if (field.type === "relation") return field.hasMany ? "string[]" : "string";
  if (field.type === "array") return `${typeForField(field.of)}[]`;
  if (field.type === "richText") return "RichTextDocument";
  if (field.type === "content") return "ContentDocument";
  if (field.type === "json") return "Record<string, unknown>";
  if (field.type === "blocks") {
    const allowShared = field.shared !== false;
    const sharedVariant = `{ type: "__shared"; ref: string; title?: string; blockType?: string }`;
    const variants = Object.entries(field.types).map(([blockType, fields]) => {
      const members = Object.entries(fields)
        .map(
          ([fieldName, nestedField]) => `${fieldName}${nestedField.required ? "" : "?"}: ${typeForField(nestedField)};`,
        )
        .join(" ");
      return `{ type: ${JSON.stringify(blockType)}; ${members} }`;
    });
    const union = allowShared ? [...variants, sharedVariant] : variants;
    return union.length > 0 ? `Array<${union.join(" | ")}>` : "Array<Record<string, unknown>>";
  }
  return "unknown";
};

const generateTypesFile = (config: CMSConfig, coreImportPath: string): string => {
  const parts: string[] = [
    `// auto-generated — do not edit`,
    `import type { RichTextDocument, ContentDocument } from "${coreImportPath}";`,
    ``,
    `export type CMSCollectionSlug = ${config.collections.map((collection) => JSON.stringify(collection.slug)).join(" | ")};`,
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
      ? translatableFields
          .map((fieldName) => `  ${fieldName}?: ${typeForField(collection.fields[fieldName])};`)
          .join("\n")
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
  _sourceLocale?: string;
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

const generateApiFile = (
  config: CMSConfig,
  coreImportPath: string,
  runtimeImportPath: string,
  configImportPath: string,
) => {
  const imports = config.collections
    .map((collection) => {
      const name = pascalCase(collection.slug);
      return [`${name}Document`, `${name}Input`, `${name}TranslationInput`];
    })
    .flat();

  const apiTypes = config.collections
    .map((collection) => {
      const baseName = pascalCase(collection.slug);
      const ctx = `context?: { user?: { id: string; role?: string; email?: string; [key: string]: unknown } | null; _system?: boolean }`;
      const apiKey = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(collection.slug) ? collection.slug : `"${collection.slug}"`;
      return `  ${apiKey}: {
    find(options?: import("${coreImportPath}").FindOptions, ${ctx}): Promise<${baseName}Document[]>;
    findOne(filter: Record<string, unknown> & { locale?: string; status?: "draft" | "published" | "scheduled" | "any" }, ${ctx}): Promise<${baseName}Document | null>;
    findById(id: string, options?: { locale?: string; status?: "draft" | "published" | "scheduled" | "any" }, ${ctx}): Promise<${baseName}Document | null>;
    create(data: ${baseName}Input, ${ctx}): Promise<${baseName}Document>;
    createMany(items: ${baseName}Input[], ${ctx}): Promise<${baseName}Document[]>;
    upsert(data: ${baseName}Input & { _id?: string }, ${ctx}): Promise<${baseName}Document>;
    update(id: string, data: Partial<${baseName}Input>, ${ctx}): Promise<${baseName}Document>;
    delete(id: string, ${ctx}): Promise<void>;
    count(filter?: Omit<import("${coreImportPath}").FindOptions, "limit" | "offset" | "sort">, ${ctx}): Promise<number>;
    versions(id: string, ${ctx}): Promise<import("./types").StoredVersion[]>;
    restore(id: string, versionNumber: number, ${ctx}): Promise<${baseName}Document>;
    publish(id: string, ${ctx}): Promise<${baseName}Document>;
    unpublish(id: string, ${ctx}): Promise<${baseName}Document>;
    schedule(id: string, publishAt: string, unpublishAt?: string | null, ${ctx}): Promise<${baseName}Document>;
    getTranslations(id: string, ${ctx}): Promise<Record<string, ${baseName}TranslationInput>>;
    upsertTranslation(id: string, locale: string, data: ${baseName}TranslationInput, ${ctx}): Promise<${baseName}Document>;
  };`;
    })
    .join("\n");

  return `// auto-generated — do not edit
import config from "${configImportPath}";
import { createCms } from "${runtimeImportPath}";
import type {
  ${imports.map((entry) => `${entry},`).join("\n  ")}
} from "./types";

export const cms = createCms(config) as {
${apiTypes}
  meta: ReturnType<typeof createCms>["meta"];
  scheduled: ReturnType<typeof createCms>["scheduled"];
};
`;
};

// Temp file + rename: a concurrent reader never sees a partially-written file.
const writeFileAtomic = async (filePath: string, content: string) => {
  const tmpPath = `${filePath}.${randomUUID()}.tmp`;
  await writeFile(tmpPath, content, "utf-8");
  await rename(tmpPath, filePath);
};

export const generate = async (config: CMSConfig, options: GeneratorOptions) => {
  const outputDir = options.outputDir;
  const coreImportPath = options.coreImportPath ?? "../core";
  const runtimeImportPath = options.runtimeImportPath ?? "../runtime";
  const configImportPath = options.configImportPath ?? "../cms.config";

  await mkdir(outputDir, { recursive: true });
  await Promise.all([
    writeFileAtomic(path.join(outputDir, "schema.ts"), generateSchemaFile(config)),
    writeFileAtomic(path.join(outputDir, "types.ts"), generateTypesFile(config, coreImportPath)),
    writeFileAtomic(path.join(outputDir, "validators.ts"), generateValidatorsFile(config)),
    writeFileAtomic(
      path.join(outputDir, "api.ts"),
      generateApiFile(config, coreImportPath, runtimeImportPath, configImportPath),
    ),
  ]);
};
