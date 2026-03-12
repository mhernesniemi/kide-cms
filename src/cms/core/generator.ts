import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import config from "../collections.config";
import { getCollectionMap, getTranslatableFieldNames, type CollectionConfig, type FieldConfig } from "./define";

const generatedDir = path.join(process.cwd(), "src/cms/.generated");

const pascalCase = (value: string) =>
  value
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");

const typeForField = (field: FieldConfig): string => {
  if (field.type === "text" || field.type === "slug" || field.type === "email" || field.type === "image" || field.type === "date") {
    return "string";
  }

  if (field.type === "number") {
    return "number";
  }

  if (field.type === "boolean") {
    return "boolean";
  }

  if (field.type === "select") {
    return field.options.map((option) => JSON.stringify(option)).join(" | ");
  }

  if (field.type === "relation") {
    return field.hasMany ? "string[]" : "string";
  }

  if (field.type === "array") {
    return `${typeForField(field.of)}[]`;
  }

  if (field.type === "richText") {
    return "RichTextDocument";
  }

  if (field.type === "json") {
    return "Record<string, unknown>";
  }

  if (field.type === "blocks") {
    const blockVariants = Object.entries(field.types).map(([blockType, fields]) => {
      const members = Object.entries(fields)
        .map(([fieldName, nestedField]) => `${fieldName}${nestedField.required ? "" : "?"}: ${typeForField(nestedField)};`)
        .join(" ");

      return `{ type: ${JSON.stringify(blockType)}; ${members} }`;
    });

    return `Array<${blockVariants.join(" | ")}>`;
  }

  return "unknown";
};

const generateCollectionType = (collection: CollectionConfig) => {
  const docName = `${pascalCase(collection.slug)}Document`;
  const inputName = `${pascalCase(collection.slug)}Input`;
  const translationName = `${pascalCase(collection.slug)}TranslationInput`;
  const translatableFields = getTranslatableFieldNames(collection);

  const fieldEntries = Object.entries(collection.fields)
    .map(([fieldName, field]) => `  ${fieldName}${field.required ? "" : "?"}: ${typeForField(field)};`)
    .join("\n");

  const translationEntries = translatableFields.length
    ? translatableFields
        .map((fieldName) => `  ${fieldName}?: ${typeForField(collection.fields[fieldName])};`)
        .join("\n")
    : "  [key: string]: never;";

  return `
export type ${inputName} = {
${fieldEntries}
};

export type ${translationName} = {
${translationEntries}
};

export type ${docName} = ${inputName} & {
  _id: string;
  _status: "draft" | "published";
  _createdAt: string;
  _updatedAt: string;
  _locale?: string | null;
  _availableLocales?: string[];
};
`;
};

const schemaContent = `// auto-generated -- do not edit
import config from "../collections.config";

export const generatedSchema = ${JSON.stringify(
  config.collections.map((collection) => ({
    slug: collection.slug,
    labels: collection.labels,
    pathPrefix: collection.pathPrefix ?? null,
    drafts: !!collection.drafts,
    versions: collection.versions?.max ?? 0,
    fields: Object.fromEntries(
      Object.entries(collection.fields).map(([fieldName, field]) => [
        fieldName,
        {
          type: field.type,
          required: !!field.required,
          translatable: !!field.translatable,
        },
      ]),
    ),
  })),
  null,
  2,
)};

export const collectionMap = Object.fromEntries(config.collections.map((collection) => [collection.slug, collection]));
`;

const typesContent = `// auto-generated -- do not edit
import type { RichTextDocument } from "../core/define";

export type CMSCollectionSlug = ${config.collections.map((collection) => JSON.stringify(collection.slug)).join(" | ")};

${config.collections.map(generateCollectionType).join("\n")}
`;

const validatorsContent = `// auto-generated -- do not edit
import config from "../collections.config";

export const validators = Object.fromEntries(
  config.collections.map((collection) => [
    collection.slug,
    {
      fields: collection.fields,
      requiredFields: Object.entries(collection.fields)
        .filter(([, field]) => field.required)
        .map(([fieldName]) => fieldName),
      translatableFields: Object.entries(collection.fields)
        .filter(([, field]) => field.translatable)
        .map(([fieldName]) => fieldName),
    },
  ]),
);
`;

const apiTypes = config.collections
  .map((collection) => {
    const baseName = pascalCase(collection.slug);
    return `  ${collection.slug}: {
    find(options?: import("../core/api").FindOptions, context?: { user?: { id: string; role?: string; email?: string } | null }): Promise<${baseName}Document[]>;
    findOne(filter: Record<string, unknown> & { locale?: string; status?: "draft" | "published" | "any" }, context?: { user?: { id: string; role?: string; email?: string } | null }): Promise<${baseName}Document | null>;
    findById(id: string, options?: { locale?: string; status?: "draft" | "published" | "any" }, context?: { user?: { id: string; role?: string; email?: string } | null }): Promise<${baseName}Document | null>;
    create(data: ${baseName}Input, context?: { user?: { id: string; role?: string; email?: string } | null }): Promise<${baseName}Document>;
    update(id: string, data: Partial<${baseName}Input>, context?: { user?: { id: string; role?: string; email?: string } | null }): Promise<${baseName}Document>;
    delete(id: string, context?: { user?: { id: string; role?: string; email?: string } | null }): Promise<void>;
    count(filter?: Omit<import("../core/api").FindOptions, "limit" | "offset" | "sort">, context?: { user?: { id: string; role?: string; email?: string } | null }): Promise<number>;
    versions(id: string): Promise<import("../core/storage").StoredVersion[]>;
    restore(id: string, versionNumber: number, context?: { user?: { id: string; role?: string; email?: string } | null }): Promise<${baseName}Document>;
    publish(id: string, context?: { user?: { id: string; role?: string; email?: string } | null }): Promise<${baseName}Document>;
    unpublish(id: string, context?: { user?: { id: string; role?: string; email?: string } | null }): Promise<${baseName}Document>;
    getTranslations(id: string): Promise<Record<string, ${baseName}TranslationInput>>;
    upsertTranslation(id: string, locale: string, data: ${baseName}TranslationInput, context?: { user?: { id: string; role?: string; email?: string } | null }): Promise<${baseName}Document>;
  };`;
  })
  .join("\n");

const apiContent = `// auto-generated -- do not edit
import access from "../access";
import config from "../collections.config";
import { createCms } from "../core/api";
import hooks from "../hooks";
import type {
${config.collections.map((collection) => `  ${pascalCase(collection.slug)}Document,`).join("\n")}
${config.collections.map((collection) => `  ${pascalCase(collection.slug)}Input,`).join("\n")}
${config.collections.map((collection) => `  ${pascalCase(collection.slug)}TranslationInput,`).join("\n")}
} from "./types";

export const cms = createCms(config, access, hooks) as ReturnType<typeof createCms> & {
${apiTypes}
};
`;

const run = async () => {
  await mkdir(generatedDir, { recursive: true });
  await Promise.all([
    writeFile(path.join(generatedDir, "schema.ts"), schemaContent, "utf-8"),
    writeFile(path.join(generatedDir, "types.ts"), typesContent, "utf-8"),
    writeFile(path.join(generatedDir, "validators.ts"), validatorsContent, "utf-8"),
    writeFile(path.join(generatedDir, "api.ts"), apiContent, "utf-8"),
  ]);
};

await run();
