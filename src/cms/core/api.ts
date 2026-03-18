import { eq, sql, and, desc, asc, lte } from "drizzle-orm";
import { nanoid } from "nanoid";

import type { AccessConfig, CMSConfig, CollectionConfig, FieldConfig, HooksConfig, RichTextDocument } from "./define";
import { getCollectionMap, getTranslatableFieldNames, isStructuralField } from "./define";
import { getDb } from "./db";
import { hashPassword } from "./auth";
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
  if (!collection) throw new Error(`Unknown collection "${slug}".`);
  return collection;
};

const getDefaultStatus = (collection: CollectionConfig) => (collection.drafts ? "draft" : "published");

const isEmptyValue = (value: unknown) =>
  value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0);

const coerceFieldValue = (field: FieldConfig, value: unknown): unknown => {
  if (value === undefined) return undefined;

  if (
    field.type === "text" ||
    field.type === "slug" ||
    field.type === "email" ||
    field.type === "image" ||
    field.type === "date"
  ) {
    return value === null ? "" : String(value).trim();
  }
  if (field.type === "number") {
    if (value === "" || value === null) return undefined;
    return Number(value);
  }
  if (field.type === "boolean") {
    return value === true || value === "true" || value === "on" || value === 1 || value === "1";
  }
  if (field.type === "select") {
    return value === "" || value === null ? "" : String(value);
  }
  if (field.type === "relation") {
    if (field.hasMany) {
      if (Array.isArray(value)) return value.map((item) => String(item));
      const str = String(value).trim();
      if (str.startsWith("[")) {
        try {
          const parsed = JSON.parse(str);
          if (Array.isArray(parsed)) return parsed.map((item: unknown) => String(item)).filter(Boolean);
        } catch {
          // fall through to comma split
        }
      }
      return str
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    }
    return value ? String(value) : "";
  }
  if (field.type === "array") {
    if (Array.isArray(value)) return value;
    if (typeof value === "string")
      return value
        .split(/\n|,/)
        .map((item) => item.trim())
        .filter(Boolean);
    return [];
  }
  if (field.type === "json" || field.type === "blocks") {
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) return field.defaultValue ?? (field.type === "blocks" ? [] : {});
      return JSON.parse(trimmed);
    }
    return value ?? field.defaultValue ?? (field.type === "blocks" ? [] : {});
  }
  if (field.type === "richText") {
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
  }
  return value;
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

  // Auto-generate slugs
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

  // Validate required
  for (const [fieldName, field] of Object.entries(collection.fields)) {
    if (!field.required) continue;
    const candidate = data[fieldName] ?? existing?.[fieldName];
    if (isEmptyValue(candidate)) throw new Error(`Field "${fieldName}" is required.`);
  }

  return data;
};

// Serialize a JS document into DB column values
const serializeForDb = (collection: CollectionConfig, data: Record<string, unknown>): Record<string, unknown> => {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    const field = collection.fields[key];
    if (field && isJsonField(field) && value !== undefined && value !== null) {
      result[key] = JSON.stringify(value);
    } else {
      result[key] = value;
    }
  }
  return result;
};

// Deserialize DB row into JS document
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
  access: AccessConfig | undefined,
  collection: CollectionConfig,
  operation: CMSOperation,
  context: RuntimeContext,
  doc?: Record<string, unknown> | null,
) => {
  const rule = access?.[collection.slug]?.[operation];
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
  const schema = await import("../.generated/schema");
  const tables = schema.cmsTables[collectionSlug as keyof typeof schema.cmsTables] as {
    main: any;
    translations?: any;
    versions?: any;
  };
  if (!tables) throw new Error(`No tables found for collection "${collectionSlug}".`);
  return tables;
};

export const createCms = (config: CMSConfig, access?: AccessConfig, hooks?: HooksConfig) => {
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
      const availableLocales = [...new Set(translations.map((t) => String(t._languageCode)))];

      if (locale) {
        const translation = translations.find((t) => t._languageCode === locale);
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
      const { password, ...rest } = doc;
      return rest;
    };

    return {
      async find(options: FindOptions = {}, context: RuntimeContext = {}) {
        const allowed = await canAccess(access, collection, "read", context);
        if (!allowed) throw new Error(`Access denied for ${collection.slug}.`);

        const db = await getDb();
        const tables = await getTableRefs(slug);
        const status = options.status ?? (collection.drafts ? "published" : "any");

        // Build conditions
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

        let query = db.select().from(tables.main);
        if (conditions.length > 0) {
          query = query.where(conditions.length === 1 ? conditions[0] : and(...conditions)) as any;
        }

        // Sort
        if (options.sort) {
          const col = tables.main[options.sort.field];
          if (col) {
            query = query.orderBy(options.sort.direction === "desc" ? desc(col) : asc(col)) as any;
          }
        }

        // Pagination
        if (options.limit) query = query.limit(options.limit) as any;
        if (options.offset) query = query.offset(options.offset) as any;

        const rows = await query;

        // Fetch translations for locale overlay
        const docs = rows.map((row: Record<string, unknown>) => deserializeFromDb(collection, row));

        if (tables.translations && (options.locale || config.locales)) {
          const docIds = docs.map((d) => String(d._id));
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

            // Deserialize translation JSON fields
            const parsedTranslations = allTranslations.map((t: Record<string, unknown>) => {
              const parsed = { ...t };
              const translatableFields = getTranslatableFieldNames(collection);
              for (const fn of translatableFields) {
                const field = collection.fields[fn];
                if (isJsonField(field) && typeof parsed[fn] === "string") {
                  try {
                    parsed[fn] = JSON.parse(parsed[fn] as string);
                  } catch {
                    /* keep string */
                  }
                }
              }
              return parsed;
            });

            return docs.map((doc) => {
              const docTranslations = parsedTranslations.filter(
                (t: Record<string, unknown>) => t._entityId === doc._id,
              );
              return stripSensitiveFields(overlayLocale(doc, docTranslations, options.locale));
            });
          }
        }

        return docs.map((doc) => stripSensitiveFields(overlayLocale(doc, [], options.locale)));
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

        const allowed = await canAccess(access, collection, "read", context, doc);
        if (!allowed) throw new Error(`Access denied for ${collection.slug}.`);

        if (options.status && options.status !== "any" && doc._status !== options.status) return null;

        // Fetch translations
        let translations: Array<Record<string, unknown>> = [];
        if (tables.translations) {
          const rawTranslations = await db
            .select()
            .from(tables.translations)
            .where(eq(tables.translations._entityId, id));
          translations = rawTranslations.map((t: Record<string, unknown>) => {
            const parsed = { ...t };
            for (const fn of getTranslatableFieldNames(collection)) {
              const field = collection.fields[fn];
              if (isJsonField(field) && typeof parsed[fn] === "string") {
                try {
                  parsed[fn] = JSON.parse(parsed[fn] as string);
                } catch {
                  /* keep string */
                }
              }
            }
            return parsed;
          });
        }

        return stripSensitiveFields(overlayLocale(doc, translations, options.locale));
      },

      async create(data: Record<string, unknown>, context: RuntimeContext = {}) {
        const allowed = await canAccess(access, collection, "create", context);
        if (!allowed) throw new Error(`Access denied for ${collection.slug}.`);

        const db = await getDb();
        const tables = await getTableRefs(slug);

        const hookContext = getHookContext(collection, "create", context);
        const preparedInput = prepareIncomingData(collection, data, undefined);

        // Hash password for auth collections
        if (collection.auth && typeof preparedInput.password === "string" && preparedInput.password) {
          preparedInput.password = await hashPassword(preparedInput.password);
        }

        const transformedInput = hooks?.[collection.slug]?.beforeCreate
          ? await hooks[collection.slug].beforeCreate!(preparedInput, hookContext)
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

        // Save version
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
        await hooks?.[collection.slug]?.afterCreate?.(result!, hookContext);
        return result!;
      },

      async update(id: string, data: Record<string, unknown>, context: RuntimeContext = {}) {
        const db = await getDb();
        const tables = await getTableRefs(slug);

        const existingRows = await db.select().from(tables.main).where(eq(tables.main._id, id)).limit(1);
        if (existingRows.length === 0) throw new Error(`${collection.labels.singular} not found.`);

        const existing = deserializeFromDb(collection, existingRows[0] as Record<string, unknown>);
        const allowed = await canAccess(access, collection, "update", context, existing);
        if (!allowed) throw new Error(`Access denied for ${collection.slug}.`);

        // Field-level access: strip fields the user cannot update
        const accessCtx = { user: context.user ?? null, doc: existing, operation: "update", collection: slug };
        for (const [fieldName, field] of Object.entries(collection.fields)) {
          if (field.access?.update && data[fieldName] !== undefined) {
            const fieldAllowed = await field.access.update(accessCtx);
            if (!fieldAllowed) delete data[fieldName];
          }
        }

        const hookContext = getHookContext(collection, "update", context);
        const preparedInput = prepareIncomingData(collection, data, undefined, existing);

        // Hash password for auth collections (only if changed)
        if (collection.auth && typeof preparedInput.password === "string" && preparedInput.password) {
          preparedInput.password = await hashPassword(preparedInput.password);
        }

        const transformedInput = hooks?.[collection.slug]?.beforeUpdate
          ? await hooks[collection.slug].beforeUpdate!(preparedInput, existing, hookContext)
          : preparedInput;

        const updateValues: Record<string, unknown> = {
          ...serializeForDb(collection, transformedInput),
        };
        if (collection.timestamps !== false) {
          updateValues._updatedAt = now();
        }

        await db.update(tables.main).set(updateValues).where(eq(tables.main._id, id));

        // Save version
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

          // Prune old versions
          if (maxVersions) {
            const allVersions = await db
              .select()
              .from(tables.versions)
              .where(eq(tables.versions._docId, id))
              .orderBy(desc(tables.versions._version));
            const toDelete = allVersions.slice(maxVersions);
            for (const v of toDelete) {
              await db.delete(tables.versions).where(eq(tables.versions._id, (v as any)._id));
            }
          }
        }

        const result = await this.findById(id, {}, context);
        await hooks?.[collection.slug]?.afterUpdate?.(result!, hookContext);
        return result!;
      },

      async delete(id: string, context: RuntimeContext = {}) {
        const db = await getDb();
        const tables = await getTableRefs(slug);

        const existingRows = await db.select().from(tables.main).where(eq(tables.main._id, id)).limit(1);
        if (existingRows.length === 0) return;

        const existing = deserializeFromDb(collection, existingRows[0] as Record<string, unknown>);
        const allowed = await canAccess(access, collection, "delete", context, existing);
        if (!allowed) throw new Error(`Access denied for ${collection.slug}.`);

        const hookContext = getHookContext(collection, "delete", context);
        await hooks?.[collection.slug]?.beforeDelete?.(existing, hookContext);

        // Cascade via FK, but also explicitly for safety
        if (tables.translations) await db.delete(tables.translations).where(eq(tables.translations._entityId, id));
        if (tables.versions) await db.delete(tables.versions).where(eq(tables.versions._docId, id));
        await db.delete(tables.main).where(eq(tables.main._id, id));

        await hooks?.[collection.slug]?.afterDelete?.(existing, hookContext);
      },

      async publish(id: string, context: RuntimeContext = {}) {
        if (!collection.drafts) throw new Error(`${collection.labels.singular} does not support draft status.`);

        const db = await getDb();
        const tables = await getTableRefs(slug);

        const existingRows = await db.select().from(tables.main).where(eq(tables.main._id, id)).limit(1);
        if (existingRows.length === 0) throw new Error(`${collection.labels.singular} not found.`);

        const existing = deserializeFromDb(collection, existingRows[0] as Record<string, unknown>);
        const allowed = await canAccess(access, collection, "publish", context, existing);
        if (!allowed) throw new Error(`Access denied for ${collection.slug}.`);

        const hookContext = getHookContext(collection, "publish", context);
        if (hooks?.[collection.slug]?.beforePublish) {
          await hooks[collection.slug].beforePublish!(existing, hookContext);
        }

        const timestamp = now();
        const updateValues: Record<string, unknown> = {
          _status: "published",
          _publishedAt: timestamp,
          _publishAt: null,
          _unpublishAt: null,
        };
        if (collection.timestamps !== false) updateValues._updatedAt = timestamp;
        await db.update(tables.main).set(updateValues).where(eq(tables.main._id, id));

        const result = await this.findById(id, { status: "any" }, context);
        await hooks?.[collection.slug]?.afterPublish?.(result!, hookContext);
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
        if (hooks?.[collection.slug]?.beforeUnpublish) {
          await hooks[collection.slug].beforeUnpublish!(existing, hookContext);
        }

        const updateValues: Record<string, unknown> = {
          _status: "draft",
          _publishedAt: null,
          _publishAt: null,
          _unpublishAt: null,
        };
        if (collection.timestamps !== false) updateValues._updatedAt = now();
        await db.update(tables.main).set(updateValues).where(eq(tables.main._id, id));

        const result = (await this.findById(id, { status: "any" }, context))!;
        await hooks?.[collection.slug]?.afterUnpublish?.(result, hookContext);
        return result;
      },

      async schedule(id: string, publishAt: string, unpublishAt?: string | null, context: RuntimeContext = {}) {
        if (!collection.drafts) throw new Error(`${collection.labels.singular} does not support draft status.`);

        const db = await getDb();
        const tables = await getTableRefs(slug);

        const existingRows = await db.select().from(tables.main).where(eq(tables.main._id, id)).limit(1);
        if (existingRows.length === 0) throw new Error(`${collection.labels.singular} not found.`);

        const existing = deserializeFromDb(collection, existingRows[0] as Record<string, unknown>);

        // Check access: use "schedule" rule, fall back to "publish"
        const scheduleAllowed = await canAccess(access, collection, "schedule", context, existing);
        const publishAllowed = access?.[collection.slug]?.schedule
          ? scheduleAllowed
          : await canAccess(access, collection, "publish", context, existing);
        if (!scheduleAllowed && !publishAllowed) throw new Error(`Access denied for ${collection.slug}.`);

        const hookContext = getHookContext(collection, "schedule", context);
        if (hooks?.[collection.slug]?.beforeSchedule) {
          await hooks[collection.slug].beforeSchedule!(existing, hookContext);
        }

        const updateValues: Record<string, unknown> = {
          _status: "scheduled",
          _publishAt: publishAt,
          _unpublishAt: unpublishAt ?? null,
        };
        if (collection.timestamps !== false) updateValues._updatedAt = now();
        await db.update(tables.main).set(updateValues).where(eq(tables.main._id, id));

        const result = (await this.findById(id, { status: "any" }, context))!;
        await hooks?.[collection.slug]?.afterSchedule?.(result, hookContext);
        return result;
      },

      async count(filter: Omit<FindOptions, "limit" | "offset" | "sort"> = {}, context: RuntimeContext = {}) {
        const docs = await this.find({ ...filter, limit: undefined, offset: undefined }, context);
        return docs.length;
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
        const version = versionList.find((v) => v.version === versionNumber);
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
          const r = row as Record<string, unknown>;
          const locale = String(r._languageCode);
          const values: Record<string, unknown> = {};
          for (const fn of getTranslatableFieldNames(collection)) {
            const field = collection.fields[fn];
            let val = r[fn];
            if (isJsonField(field) && typeof val === "string") {
              try {
                val = JSON.parse(val);
              } catch {
                /* keep string */
              }
            }
            values[fn] = val;
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
        const allowed = await canAccess(access, collection, "update", context, existing);
        if (!allowed) throw new Error(`Access denied for ${collection.slug}.`);

        const translatableFields = getTranslatableFieldNames(collection);
        const translatedValues = prepareIncomingData(collection, data, locale, existing);
        const filtered = pick(translatedValues, translatableFields);
        const serialized = serializeForDb(collection, filtered);

        // Check if translation exists
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

        // Update main doc timestamp
        if (collection.timestamps !== false) {
          await db.update(tables.main).set({ _updatedAt: now() }).where(eq(tables.main._id, id));
        }

        // Save version
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
        return collection.pathPrefix
          ? `/${collection.pathPrefix}/${slugValue}`
          : `/${slugValue === "home" ? "" : slugValue}`;
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
          const ctx: RuntimeContext = { cache };

          // Publish scheduled docs whose _publishAt <= now
          const toPublish = await db
            .select()
            .from(tables.main)
            .where(and(eq(tables.main._status, "scheduled"), lte(tables.main._publishAt, timestamp)));

          for (const row of toPublish) {
            const doc = row as Record<string, unknown>;
            await collectionApiInstance.publish(String(doc._id), ctx);
            published++;
          }

          // Unpublish published docs whose _unpublishAt <= now
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
