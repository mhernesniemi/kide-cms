import { and, asc, desc, eq, like, lte, or, sql } from "drizzle-orm";
import { nanoid } from "nanoid";

import { hashPassword } from "./auth";
import type { CMSConfig, CollectionConfig, FieldConfig, RichTextDocument } from "./define";
import { getCollectionMap, getTranslatableFieldNames, isStructuralField } from "./define";
import { getDb } from "./runtime";
import { getSchema } from "./schema";
import { cloneValue, createRichTextFromPlainText, slugify } from "./values";

export type FindOptions = {
  where?: Record<string, unknown>;
  sort?: {
    field: string;
    direction: "asc" | "desc";
  };
  limit?: number;
  offset?: number;
  status?: "draft" | "published" | "scheduled" | "any";
  locale?: string;
  search?: string;
};

type RuntimeContext = {
  user?: {
    id: string;
    role?: string;
    email?: string;
  } | null;
  cache?: {
    invalidate: (opts: { tags: string[] }) => void | Promise<void>;
  };
  _system?: boolean;
};

type CMSOperation = "read" | "create" | "update" | "delete" | "publish" | "schedule";

const now = () => new Date().toISOString();

const pick = (input: Record<string, unknown>, keys: string[]) =>
  Object.fromEntries(keys.filter((key) => key in input).map((key) => [key, input[key]]));

const isJsonField = (field: FieldConfig) =>
  field.type === "richText" ||
  field.type === "array" ||
  field.type === "json" ||
  field.type === "blocks" ||
  (field.type === "relation" && field.hasMany);

const ensureCollection = (config: CMSConfig, slug: string) => {
  const collection = getCollectionMap(config)[slug];
  if (!collection) {
    const available = config.collections.map((collectionEntry) => collectionEntry.slug).join(", ");
    throw new Error(`Unknown collection "${slug}". Available collections: ${available}`);
  }
  return collection;
};

const getDefaultStatus = (collection: CollectionConfig) => (collection.drafts ? "draft" : "published");

const isEmptyValue = (value: unknown) =>
  value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0);

const coerceString = (value: unknown) => (value === null ? "" : String(value).trim());
const coerceNumber = (value: unknown) => (value === "" || value === null ? undefined : Number(value));
const coerceBoolean = (value: unknown) =>
  value === true || value === "true" || value === "on" || value === 1 || value === "1";

const coerceRelation = (field: FieldConfig, value: unknown) => {
  if (!("hasMany" in field && field.hasMany)) return value ? String(value) : "";
  if (Array.isArray(value)) return value.map((item) => String(item));

  const stringValue = String(value).trim();
  if (stringValue.startsWith("[")) {
    try {
      const parsed = JSON.parse(stringValue);
      if (Array.isArray(parsed)) return parsed.map((item: unknown) => String(item)).filter(Boolean);
    } catch {
      // fall through to comma split
    }
  }

  return stringValue
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
};

const coerceArray = (value: unknown) => {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    return value
      .split(/\n|,/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
};

const coerceJsonOrBlocks = (field: FieldConfig, value: unknown) => {
  const fallback = field.defaultValue ?? (field.type === "blocks" ? [] : {});
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? JSON.parse(trimmed) : fallback;
  }
  return value ?? fallback;
};

const coerceRichText = (value: unknown) => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.startsWith("{")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed?.type === "root") return parsed;
      } catch {}
    }
    return createRichTextFromPlainText(value);
  }
  return (value as RichTextDocument | undefined) ?? createRichTextFromPlainText("");
};

const coerceFieldValue = (field: FieldConfig, value: unknown): unknown => {
  if (value === undefined) return undefined;

  switch (field.type) {
    case "text":
    case "slug":
    case "email":
    case "image":
    case "date":
      return coerceString(value);
    case "number":
      return coerceNumber(value);
    case "boolean":
      return coerceBoolean(value);
    case "select":
      return value === "" || value === null ? "" : String(value);
    case "relation":
      return coerceRelation(field, value);
    case "array":
      return coerceArray(value);
    case "json":
    case "blocks":
      return coerceJsonOrBlocks(field, value);
    case "richText":
      return coerceRichText(value);
    default:
      return value;
  }
};

const prepareIncomingData = (
  collection: CollectionConfig,
  input: Record<string, unknown>,
  locale: string | undefined,
  existing?: Record<string, unknown>,
) => {
  const data: Record<string, unknown> = {};
  const translatableFields = new Set(getTranslatableFieldNames(collection));

  for (const [fieldName, field] of Object.entries(collection.fields)) {
    if (locale && !translatableFields.has(fieldName)) continue;
    if (!locale && translatableFields.has(fieldName) && input[fieldName] === undefined && existing) continue;

    const rawValue = input[fieldName];
    const coercedValue = coerceFieldValue(field, rawValue);

    if (coercedValue === undefined) {
      if (!existing && field.defaultValue !== undefined) {
        data[fieldName] = cloneValue(field.defaultValue);
      }
      continue;
    }

    data[fieldName] = coercedValue;
  }

  for (const [fieldName, field] of Object.entries(collection.fields)) {
    if (field.type !== "slug") continue;
    if (!isEmptyValue(data[fieldName])) {
      data[fieldName] = slugify(String(data[fieldName]));
      continue;
    }
    const sourceField = field.from;
    const sourceValue = sourceField ? (data[sourceField] ?? input[sourceField]) : undefined;
    if (sourceValue) data[fieldName] = slugify(String(sourceValue));
  }

  for (const [fieldName, field] of Object.entries(collection.fields)) {
    if (!field.required) continue;
    const candidate = data[fieldName] ?? existing?.[fieldName];
    if (isEmptyValue(candidate)) throw new Error(`Field "${fieldName}" is required.`);
  }

  return data;
};

const serializeForDb = (collection: CollectionConfig, data: Record<string, unknown>): Record<string, unknown> => {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    const field = collection.fields[key];
    result[key] = field && isJsonField(field) && value !== undefined && value !== null ? JSON.stringify(value) : value;
  }
  return result;
};

const deserializeFromDb = (collection: CollectionConfig, row: Record<string, unknown>): Record<string, unknown> => {
  const result: Record<string, unknown> = { ...row };
  for (const [key, field] of Object.entries(collection.fields)) {
    if (isJsonField(field) && typeof result[key] === "string") {
      try {
        result[key] = JSON.parse(result[key] as string);
      } catch {
        // leave as string if not valid JSON
      }
    }
  }
  return result;
};

const canAccess = async (
  collection: CollectionConfig,
  operation: CMSOperation,
  context: RuntimeContext,
  doc?: Record<string, unknown> | null,
) => {
  if (context._system) return true;
  const rule = collection.access?.[operation];
  if (!rule) return true;
  return rule({ user: context.user ?? null, doc: doc ?? null, operation, collection: collection.slug });
};

const getHookContext = (collection: CollectionConfig, operation: string, context: RuntimeContext) => ({
  user: context.user ?? null,
  operation,
  collection: collection.slug,
  timestamp: now(),
  cache: context.cache,
});

const getTableRefs = async (collectionSlug: string) => {
  const tables = getSchema().cmsTables[collectionSlug] as {
    main: any;
    translations?: any;
    versions?: any;
  };

  if (!tables) throw new Error(`No tables found for collection "${collectionSlug}".`);
  return tables;
};

export const createCms = (config: CMSConfig) => {
  const collectionMap = getCollectionMap(config);

  const createCollectionApi = (slug: string) => {
    const collection = ensureCollection(config, slug);

    const overlayLocale = (
      doc: Record<string, unknown>,
      translations: Array<Record<string, unknown>>,
      locale?: string | null,
    ) => {
      const baseDoc = { ...doc };
      const translatableFields = getTranslatableFieldNames(collection);
      const availableLocales = [...new Set(translations.map((translation) => String(translation._languageCode)))];

      if (locale) {
        const translation = translations.find((entry) => entry._languageCode === locale);
        if (translation) {
          for (const fieldName of translatableFields) {
            if (translation[fieldName] !== undefined && translation[fieldName] !== null) {
              baseDoc[fieldName] = translation[fieldName];
            }
          }
        }
      }

      return {
        ...baseDoc,
        _availableLocales: availableLocales,
        _locale: locale ?? null,
      };
    };

    const stripSensitiveFields = (doc: Record<string, unknown>) => {
      if (!collection.auth) return doc;
      const { password: _password, ...rest } = doc;
      return rest;
    };

    return {
      async find(options: FindOptions = {}, context: RuntimeContext = {}) {
        const allowed = await canAccess(collection, "read", context);
        if (!allowed) throw new Error(`Access denied for ${collection.slug}.`);

        const db = await getDb();
        const tables = await getTableRefs(slug);
        const status = options.status ?? (collection.drafts ? "published" : "any");

        const conditions: any[] = [];
        if (status !== "any" && collection.drafts) {
          conditions.push(eq(tables.main._status, status));
        }
        if (options.where) {
          for (const [key, value] of Object.entries(options.where)) {
            if (key in tables.main) {
              conditions.push(eq(tables.main[key], value));
            }
          }
        }

        if (options.search?.trim()) {
          const searchTerm = `%${options.search.trim().toLowerCase()}%`;
          const searchableTypes = new Set(["text", "slug", "email", "select"]);
          const searchConditions = Object.entries(collection.fields)
            .filter(([, field]) => searchableTypes.has(field.type))
            .filter(([name]) => name in tables.main)
            .map(([name]) => like(sql`lower(${tables.main[name]})`, searchTerm));
          if (searchConditions.length > 0) {
            conditions.push(or(...searchConditions)!);
          }
        }

        let query = db.select().from(tables.main);
        if (conditions.length > 0) {
          query = query.where(conditions.length === 1 ? conditions[0] : and(...conditions)) as any;
        }

        if (options.sort) {
          const col = tables.main[options.sort.field];
          if (col) {
            query = query.orderBy(options.sort.direction === "desc" ? desc(col) : asc(col)) as any;
          }
        }

        if (options.limit) query = query.limit(options.limit) as any;
        if (options.offset) query = query.offset(options.offset) as any;

        const rows = await query;
        const docs = rows.map((row: Record<string, unknown>) => {
          const doc = deserializeFromDb(collection, row);
          if (status === "published" && typeof row._published === "string") {
            try {
              const snapshot = JSON.parse(row._published);
              for (const key of Object.keys(collection.fields)) {
                if (key in snapshot) doc[key] = snapshot[key];
              }
            } catch {}
          }
          return doc;
        });

        if (tables.translations && (options.locale || config.locales)) {
          const docIds = docs.map((doc: Record<string, unknown>) => String(doc._id));
          if (docIds.length > 0) {
            const allTranslations = await db
              .select()
              .from(tables.translations)
              .where(
                sql`${tables.translations._entityId} IN (${sql.join(
                  docIds.map((id: string) => sql`${id}`),
                  sql`, `,
                )})`,
              );

            const parsedTranslations = allTranslations.map((translation: Record<string, unknown>) => {
              const parsed = { ...translation };
              const translatableFields = getTranslatableFieldNames(collection);
              for (const fieldName of translatableFields) {
                const field = collection.fields[fieldName];
                if (isJsonField(field) && typeof parsed[fieldName] === "string") {
                  try {
                    parsed[fieldName] = JSON.parse(parsed[fieldName] as string);
                  } catch {}
                }
              }
              return parsed;
            });

            return docs.map((doc: Record<string, unknown>) => {
              const docTranslations = parsedTranslations.filter(
                (translation: Record<string, unknown>) => translation._entityId === doc._id,
              );
              return stripSensitiveFields(overlayLocale(doc, docTranslations, options.locale));
            });
          }
        }

        return docs.map((doc: Record<string, unknown>) => stripSensitiveFields(overlayLocale(doc, [], options.locale)));
      },

      async findOne(
        filter: Record<string, unknown> & { locale?: string; status?: FindOptions["status"] },
        context: RuntimeContext = {},
      ) {
        const docs = await this.find(
          {
            where: pick(filter, Object.keys(collection.fields).concat(["_id", "_status", "slug"])),
            locale: filter.locale,
            status: filter.status,
            limit: 1,
          },
          context,
        );
        return docs[0] ?? null;
      },

      async findById(
        id: string,
        options: { locale?: string; status?: FindOptions["status"] } = {},
        context: RuntimeContext = {},
      ) {
        const db = await getDb();
        const tables = await getTableRefs(slug);
        const rows = await db.select().from(tables.main).where(eq(tables.main._id, id)).limit(1);
        if (rows.length === 0) return null;

        const doc = deserializeFromDb(collection, rows[0] as Record<string, unknown>);
        const allowed = await canAccess(collection, "read", context, doc);
        if (!allowed) throw new Error(`Access denied for ${collection.slug}.`);
        if (options.status && options.status !== "any" && doc._status !== options.status) return null;

        const effectiveStatus = options.status ?? (collection.drafts ? "published" : "any");
        if (effectiveStatus === "published" && typeof (rows[0] as any)._published === "string") {
          try {
            const snapshot = JSON.parse((rows[0] as any)._published);
            for (const key of Object.keys(collection.fields)) {
              if (key in snapshot) doc[key] = snapshot[key];
            }
          } catch {}
        }

        let translations: Array<Record<string, unknown>> = [];
        if (tables.translations) {
          const rawTranslations = await db.select().from(tables.translations).where(eq(tables.translations._entityId, id));
          translations = rawTranslations.map((translation: Record<string, unknown>) => {
            const parsed = { ...translation };
            for (const fieldName of getTranslatableFieldNames(collection)) {
              const field = collection.fields[fieldName];
              if (isJsonField(field) && typeof parsed[fieldName] === "string") {
                try {
                  parsed[fieldName] = JSON.parse(parsed[fieldName] as string);
                } catch {}
              }
            }
            return parsed;
          });
        }

        return stripSensitiveFields(overlayLocale(doc, translations, options.locale));
      },

      async create(data: Record<string, unknown>, context: RuntimeContext = {}) {
        const allowed = await canAccess(collection, "create", context);
        if (!allowed) throw new Error(`Access denied for ${collection.slug}.`);

        const db = await getDb();
        const tables = await getTableRefs(slug);
        const hookContext = getHookContext(collection, "create", context);
        const preparedInput = prepareIncomingData(collection, data, undefined);

        if (collection.auth && typeof preparedInput.password === "string" && preparedInput.password) {
          preparedInput.password = await hashPassword(preparedInput.password);
        }

        const transformedInput = collection.hooks?.beforeCreate
          ? await collection.hooks.beforeCreate(preparedInput, hookContext)
          : preparedInput;

        const createdAt = now();
        const docId = typeof data._id === "string" ? String(data._id) : nanoid();
        const docValues: Record<string, unknown> = {
          _id: docId,
          ...serializeForDb(collection, transformedInput),
        };

        if (collection.drafts) {
          const status = data._status === "published" ? "published" : getDefaultStatus(collection);
          docValues._status = status;
          if (status === "published") docValues._publishedAt = createdAt;
        }
        if (collection.timestamps !== false) {
          docValues._createdAt = createdAt;
          docValues._updatedAt = createdAt;
        }

        await db.insert(tables.main).values(docValues);

        if (collection.versions && tables.versions) {
          await db.insert(tables.versions).values({
            _id: nanoid(),
            _docId: docId,
            _version: 1,
            _snapshot: JSON.stringify({ ...transformedInput, _status: docValues._status }),
            _createdAt: createdAt,
          });
        }

        const result = await this.findById(docId, {}, context);
        await collection.hooks?.afterCreate?.(result!, hookContext);
        return result!;
      },

      async update(id: string, data: Record<string, unknown>, context: RuntimeContext = {}) {
        const db = await getDb();
        const tables = await getTableRefs(slug);
        const existingRows = await db.select().from(tables.main).where(eq(tables.main._id, id)).limit(1);
        if (existingRows.length === 0) throw new Error(`${collection.labels.singular} not found.`);

        const existing = deserializeFromDb(collection, existingRows[0] as Record<string, unknown>);
        const allowed = await canAccess(collection, "update", context, existing);
        if (!allowed) throw new Error(`Access denied for ${collection.slug}.`);

        const accessCtx = { user: context.user ?? null, doc: existing, operation: "update", collection: slug };
        for (const [fieldName, field] of Object.entries(collection.fields)) {
          if (field.access?.update && data[fieldName] !== undefined) {
            const fieldAllowed = await field.access.update(accessCtx);
            if (!fieldAllowed) delete data[fieldName];
          }
        }

        const hookContext = getHookContext(collection, "update", context);
        const preparedInput = prepareIncomingData(collection, data, undefined, existing);

        if (collection.auth && typeof preparedInput.password === "string" && preparedInput.password) {
          preparedInput.password = await hashPassword(preparedInput.password);
        }

        const transformedInput = collection.hooks?.beforeUpdate
          ? await collection.hooks.beforeUpdate(preparedInput, existing, hookContext)
          : preparedInput;

        if (collection.drafts && existing._status === "published" && !(existingRows[0] as any)._published) {
          const snapshot: Record<string, unknown> = {};
          for (const fieldName of Object.keys(collection.fields)) {
            if (existing[fieldName] !== undefined) snapshot[fieldName] = existing[fieldName];
          }
          await db.update(tables.main).set({ _published: JSON.stringify(snapshot) }).where(eq(tables.main._id, id));
        }

        const updateValues: Record<string, unknown> = {
          ...serializeForDb(collection, transformedInput),
        };
        if (collection.timestamps !== false) {
          updateValues._updatedAt = now();
        }

        await db.update(tables.main).set(updateValues).where(eq(tables.main._id, id));

        if (collection.versions && tables.versions) {
          const versionRows = await db
            .select({ maxVersion: sql<number>`coalesce(max(_version), 0)` })
            .from(tables.versions)
            .where(eq(tables.versions._docId, id));
          const nextVersion = Number(versionRows[0]?.maxVersion ?? 0) + 1;
          const maxVersions = collection.versions.max;

          await db.insert(tables.versions).values({
            _id: nanoid(),
            _docId: id,
            _version: nextVersion,
            _snapshot: JSON.stringify({ ...existing, ...transformedInput }),
            _createdAt: now(),
          });

          if (maxVersions) {
            const allVersions = await db
              .select()
              .from(tables.versions)
              .where(eq(tables.versions._docId, id))
              .orderBy(desc(tables.versions._version));
            const toDelete = allVersions.slice(maxVersions);
            for (const version of toDelete) {
              await db.delete(tables.versions).where(eq(tables.versions._id, (version as any)._id));
            }
          }
        }

        const result = await this.findById(id, { status: "any" }, context);
        await collection.hooks?.afterUpdate?.(result!, hookContext);
        return result!;
      },

      async delete(id: string, context: RuntimeContext = {}) {
        const db = await getDb();
        const tables = await getTableRefs(slug);
        const existingRows = await db.select().from(tables.main).where(eq(tables.main._id, id)).limit(1);
        if (existingRows.length === 0) return;

        const existing = deserializeFromDb(collection, existingRows[0] as Record<string, unknown>);
        const allowed = await canAccess(collection, "delete", context, existing);
        if (!allowed) throw new Error(`Access denied for ${collection.slug}.`);

        const hookContext = getHookContext(collection, "delete", context);
        await collection.hooks?.beforeDelete?.(existing, hookContext);

        if (tables.translations) await db.delete(tables.translations).where(eq(tables.translations._entityId, id));
        if (tables.versions) await db.delete(tables.versions).where(eq(tables.versions._docId, id));
        await db.delete(tables.main).where(eq(tables.main._id, id));

        await collection.hooks?.afterDelete?.(existing, hookContext);
      },

      async publish(id: string, context: RuntimeContext = {}) {
        if (!collection.drafts) throw new Error(`${collection.labels.singular} does not support draft status.`);

        const db = await getDb();
        const tables = await getTableRefs(slug);
        const existingRows = await db.select().from(tables.main).where(eq(tables.main._id, id)).limit(1);
        if (existingRows.length === 0) throw new Error(`${collection.labels.singular} not found.`);

        const existing = deserializeFromDb(collection, existingRows[0] as Record<string, unknown>);
        const allowed = await canAccess(collection, "publish", context, existing);
        if (!allowed) throw new Error(`Access denied for ${collection.slug}.`);

        const hookContext = getHookContext(collection, "publish", context);
        if (collection.hooks?.beforePublish) {
          await collection.hooks.beforePublish(existing, hookContext);
        }

        const timestamp = now();
        const updateValues: Record<string, unknown> = {
          _status: "published",
          _publishedAt: timestamp,
          _publishAt: null,
          _unpublishAt: null,
          _published: null,
        };
        if (collection.timestamps !== false) updateValues._updatedAt = timestamp;
        await db.update(tables.main).set(updateValues).where(eq(tables.main._id, id));

        const result = await this.findById(id, { status: "any" }, context);
        await collection.hooks?.afterPublish?.(result!, hookContext);
        return result!;
      },

      async unpublish(id: string, context: RuntimeContext = {}) {
        if (!collection.drafts) throw new Error(`${collection.labels.singular} does not support draft status.`);

        const db = await getDb();
        const tables = await getTableRefs(slug);
        const existingRows = await db.select().from(tables.main).where(eq(tables.main._id, id)).limit(1);
        if (existingRows.length === 0) throw new Error(`${collection.labels.singular} not found.`);

        const existing = deserializeFromDb(collection, existingRows[0] as Record<string, unknown>);
        const hookContext = getHookContext(collection, "unpublish", context);
        if (collection.hooks?.beforeUnpublish) {
          await collection.hooks.beforeUnpublish(existing, hookContext);
        }

        const updateValues: Record<string, unknown> = {
          _status: "draft",
          _publishedAt: null,
          _publishAt: null,
          _unpublishAt: null,
          _published: null,
        };
        if (collection.timestamps !== false) updateValues._updatedAt = now();
        await db.update(tables.main).set(updateValues).where(eq(tables.main._id, id));

        const result = (await this.findById(id, { status: "any" }, context))!;
        await collection.hooks?.afterUnpublish?.(result, hookContext);
        return result;
      },

      async schedule(id: string, publishAt: string, unpublishAt?: string | null, context: RuntimeContext = {}) {
        if (!collection.drafts) throw new Error(`${collection.labels.singular} does not support draft status.`);

        const db = await getDb();
        const tables = await getTableRefs(slug);
        const existingRows = await db.select().from(tables.main).where(eq(tables.main._id, id)).limit(1);
        if (existingRows.length === 0) throw new Error(`${collection.labels.singular} not found.`);

        const existing = deserializeFromDb(collection, existingRows[0] as Record<string, unknown>);
        const scheduleAllowed = await canAccess(collection, "schedule", context, existing);
        const publishAllowed = collection.access?.schedule
          ? scheduleAllowed
          : await canAccess(collection, "publish", context, existing);
        if (!scheduleAllowed && !publishAllowed) throw new Error(`Access denied for ${collection.slug}.`);

        const hookContext = getHookContext(collection, "schedule", context);
        if (collection.hooks?.beforeSchedule) {
          await collection.hooks.beforeSchedule(existing, hookContext);
        }

        const updateValues: Record<string, unknown> = {
          _status: "scheduled",
          _publishAt: publishAt,
          _unpublishAt: unpublishAt ?? null,
        };
        if (collection.timestamps !== false) updateValues._updatedAt = now();
        await db.update(tables.main).set(updateValues).where(eq(tables.main._id, id));

        const result = (await this.findById(id, { status: "any" }, context))!;
        await collection.hooks?.afterSchedule?.(result, hookContext);
        return result;
      },

      async discardDraft(id: string, context: RuntimeContext = {}) {
        if (!collection.drafts) throw new Error(`${collection.labels.singular} does not support draft status.`);

        const db = await getDb();
        const tables = await getTableRefs(slug);
        const existingRows = await db.select().from(tables.main).where(eq(tables.main._id, id)).limit(1);
        if (existingRows.length === 0) throw new Error(`${collection.labels.singular} not found.`);

        const existing = deserializeFromDb(collection, existingRows[0] as Record<string, unknown>);
        const allowed = await canAccess(collection, "update", context, existing);
        if (!allowed) throw new Error(`Access denied for ${collection.slug}.`);

        const rawPublished = (existingRows[0] as any)._published;
        if (!rawPublished) return (await this.findById(id, { status: "any" }, context))!;

        const snapshot = JSON.parse(rawPublished);
        const restoreValues: Record<string, unknown> = { _published: null };
        for (const [fieldName, field] of Object.entries(collection.fields)) {
          if (fieldName in snapshot) {
            restoreValues[fieldName] =
              isJsonField(field) && snapshot[fieldName] !== null
                ? JSON.stringify(snapshot[fieldName])
                : snapshot[fieldName];
          }
        }

        await db.update(tables.main).set(restoreValues).where(eq(tables.main._id, id));
        return (await this.findById(id, { status: "any" }, context))!;
      },

      async count(filter: Omit<FindOptions, "limit" | "offset" | "sort"> = {}, context: RuntimeContext = {}) {
        const allowed = await canAccess(collection, "read", context);
        if (!allowed) throw new Error(`Access denied for ${collection.slug}.`);

        const db = await getDb();
        const tables = await getTableRefs(slug);
        const status = filter.status ?? (collection.drafts ? "published" : "any");

        const conditions: any[] = [];
        if (status !== "any" && collection.drafts) {
          conditions.push(eq(tables.main._status, status));
        }
        if (filter.where) {
          for (const [key, value] of Object.entries(filter.where)) {
            if (key in tables.main) {
              conditions.push(eq(tables.main[key], value));
            }
          }
        }
        if (filter.search?.trim()) {
          const searchTerm = `%${filter.search.trim().toLowerCase()}%`;
          const searchableTypes = new Set(["text", "slug", "email", "select"]);
          const searchConditions = Object.entries(collection.fields)
            .filter(([, field]) => searchableTypes.has(field.type))
            .filter(([name]) => name in tables.main)
            .map(([name]) => like(sql`lower(${tables.main[name]})`, searchTerm));
          if (searchConditions.length > 0) {
            conditions.push(or(...searchConditions)!);
          }
        }

        let query = db.select({ total: sql<number>`count(*)` }).from(tables.main);
        if (conditions.length > 0) {
          query = query.where(conditions.length === 1 ? conditions[0] : and(...conditions)) as any;
        }

        const result = await query;
        return Number((result[0] as any)?.total ?? 0);
      },

      async versions(id: string) {
        const tables = await getTableRefs(slug);
        if (!tables.versions) return [];
        const db = await getDb();
        const rows = await db
          .select()
          .from(tables.versions)
          .where(eq(tables.versions._docId, id))
          .orderBy(desc(tables.versions._version));
        return rows.map((row: Record<string, unknown>) => ({
          version: row._version as number,
          createdAt: row._createdAt as string,
          snapshot: typeof row._snapshot === "string" ? JSON.parse(row._snapshot) : row._snapshot,
        }));
      },

      async restore(id: string, versionNumber: number, context: RuntimeContext = {}) {
        const versionList = await this.versions(id);
        const version = versionList.find((entry: { version: number }) => entry.version === versionNumber);
        if (!version) throw new Error(`Version ${versionNumber} not found.`);
        return this.update(id, version.snapshot, context);
      },

      async getTranslations(id: string) {
        const tables = await getTableRefs(slug);
        if (!tables.translations) return {};
        const db = await getDb();
        const rows = await db.select().from(tables.translations).where(eq(tables.translations._entityId, id));

        const result: Record<string, Record<string, unknown>> = {};
        for (const row of rows) {
          const translation = row as Record<string, unknown>;
          const locale = String(translation._languageCode);
          const values: Record<string, unknown> = {};

          for (const fieldName of getTranslatableFieldNames(collection)) {
            const field = collection.fields[fieldName];
            let value = translation[fieldName];
            if (isJsonField(field) && typeof value === "string") {
              try {
                value = JSON.parse(value);
              } catch {}
            }
            values[fieldName] = value;
          }

          result[locale] = values;
        }

        return result;
      },

      async upsertTranslation(id: string, locale: string, data: Record<string, unknown>, context: RuntimeContext = {}) {
        const db = await getDb();
        const tables = await getTableRefs(slug);
        if (!tables.translations) throw new Error(`Collection "${slug}" does not support translations.`);

        const existingRows = await db.select().from(tables.main).where(eq(tables.main._id, id)).limit(1);
        if (existingRows.length === 0) throw new Error(`${collection.labels.singular} not found.`);

        const existing = deserializeFromDb(collection, existingRows[0] as Record<string, unknown>);
        const allowed = await canAccess(collection, "update", context, existing);
        if (!allowed) throw new Error(`Access denied for ${collection.slug}.`);

        const translatableFields = getTranslatableFieldNames(collection);
        const translatedValues = prepareIncomingData(collection, data, locale, existing);
        const filtered = pick(translatedValues, translatableFields);
        const serialized = serializeForDb(collection, filtered);

        const existingTranslation = await db
          .select()
          .from(tables.translations)
          .where(and(eq(tables.translations._entityId, id), eq(tables.translations._languageCode, locale)))
          .limit(1);

        if (existingTranslation.length > 0) {
          await db
            .update(tables.translations)
            .set(serialized)
            .where(and(eq(tables.translations._entityId, id), eq(tables.translations._languageCode, locale)));
        } else {
          await db.insert(tables.translations).values({
            _id: nanoid(),
            _entityId: id,
            _languageCode: locale,
            ...serialized,
          });
        }

        if (collection.timestamps !== false) {
          await db.update(tables.main).set({ _updatedAt: now() }).where(eq(tables.main._id, id));
        }

        if (collection.versions && tables.versions) {
          const versionRows = await db
            .select({ maxVersion: sql<number>`coalesce(max(_version), 0)` })
            .from(tables.versions)
            .where(eq(tables.versions._docId, id));
          const nextVersion = Number(versionRows[0]?.maxVersion ?? 0) + 1;
          await db.insert(tables.versions).values({
            _id: nanoid(),
            _docId: id,
            _version: nextVersion,
            _snapshot: JSON.stringify({ ...existing, _translations: { [locale]: filtered } }),
            _createdAt: now(),
          });
        }

        return (await this.findById(id, { locale, status: "any" }, context))!;
      },
    };
  };

  const collectionApiEntries = Object.keys(collectionMap).map((slug) => [slug, createCollectionApi(slug)]);

  return {
    ...Object.fromEntries(collectionApiEntries),
    meta: {
      getCollections: () =>
        config.collections.map((collection) => ({
          slug: collection.slug,
          labels: collection.labels,
          pathPrefix: collection.pathPrefix,
          drafts: !!collection.drafts,
          versions: collection.versions?.max ?? 0,
        })),
      getFields: (slug: string) => ensureCollection(config, slug).fields,
      getCollection: (slug: string) => ensureCollection(config, slug),
      getRouteForDocument: (slug: string, doc: Record<string, unknown>) => {
        const collection = ensureCollection(config, slug);
        const slugValue = String(doc.slug ?? "");
        return collection.pathPrefix ? `/${collection.pathPrefix}/${slugValue}` : `/${slugValue === "home" ? "" : slugValue}`;
      },
      getConfig: () => config,
      getLocales: () => config.locales,
      isTranslatableField: (slug: string, fieldName: string) => {
        const collection = ensureCollection(config, slug);
        const field = collection.fields[fieldName];
        return !!field?.translatable && !isStructuralField(field);
      },
    },
    scheduled: {
      async processPublishing(cache?: { invalidate: (opts: { tags: string[] }) => void | Promise<void> }) {
        const db = await getDb();
        const timestamp = now();
        let published = 0;
        let unpublished = 0;

        for (const collection of config.collections) {
          if (!collection.drafts) continue;

          const tables = await getTableRefs(collection.slug);
          const collectionApiInstance = createCollectionApi(collection.slug);
          const ctx: RuntimeContext = { cache, _system: true };

          const toPublish = await db
            .select()
            .from(tables.main)
            .where(and(eq(tables.main._status, "scheduled"), lte(tables.main._publishAt, timestamp)));

          for (const row of toPublish) {
            const doc = row as Record<string, unknown>;
            await collectionApiInstance.publish(String(doc._id), ctx);
            published++;
          }

          const toUnpublish = await db
            .select()
            .from(tables.main)
            .where(
              and(
                eq(tables.main._status, "published"),
                sql`${tables.main._unpublishAt} IS NOT NULL`,
                lte(tables.main._unpublishAt, timestamp),
              ),
            );

          for (const row of toUnpublish) {
            const doc = row as Record<string, unknown>;
            await collectionApiInstance.unpublish(String(doc._id), ctx);
            unpublished++;
          }
        }

        return { published, unpublished };
      },
    },
  };
};
