import type { AccessConfig, CMSConfig, CollectionConfig, FieldConfig, HooksConfig, RichTextDocument } from "./define";
import { getCollectionMap, getTranslatableFieldNames, isStructuralField } from "./define";
import type { CollectionStore, StoredVersion } from "./storage";
import { readCollectionStore, writeCollectionStore } from "./storage";
import { cloneValue, createRichTextFromPlainText, slugify } from "./values";

export type FindOptions = {
  where?: Record<string, unknown>;
  sort?: {
    field: string;
    direction: "asc" | "desc";
  };
  limit?: number;
  offset?: number;
  status?: "draft" | "published" | "any";
  locale?: string;
};

type RuntimeContext = {
  user?: {
    id: string;
    role?: string;
    email?: string;
  } | null;
};

type StoredDocument = Record<string, unknown> & {
  _id: string;
  _status: "draft" | "published";
  _createdAt: string;
  _updatedAt: string;
  _translations?: Record<string, Record<string, unknown>>;
};

type CMSOperation = "read" | "create" | "update" | "delete" | "publish";

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const now = () => new Date().toISOString();

const createId = () => crypto.randomUUID();

const pick = (input: Record<string, unknown>, keys: string[]) =>
  Object.fromEntries(keys.filter((key) => key in input).map((key) => [key, input[key]]));

const ensureCollection = (config: CMSConfig, slug: string) => {
  const collection = getCollectionMap(config)[slug];
  if (!collection) {
    throw new Error(`Unknown collection "${slug}".`);
  }

  return collection;
};

const getDefaultStatus = (collection: CollectionConfig) => (collection.drafts ? "draft" : "published");

const isEmptyValue = (value: unknown) =>
  value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0);

const coerceFieldValue = (field: FieldConfig, value: unknown): unknown => {
  if (value === undefined) {
    return undefined;
  }

  if (field.type === "text" || field.type === "slug" || field.type === "email" || field.type === "image" || field.type === "date") {
    return value === null ? "" : String(value).trim();
  }

  if (field.type === "number") {
    if (value === "" || value === null) {
      return undefined;
    }
    return Number(value);
  }

  if (field.type === "boolean") {
    return value === true || value === "true" || value === "on" || value === 1 || value === "1";
  }

  if (field.type === "select") {
    if (!value) {
      return undefined;
    }
    return String(value);
  }

  if (field.type === "relation") {
    if (field.hasMany) {
      if (Array.isArray(value)) {
        return value.map((item) => String(item));
      }
      return String(value)
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    }

    return value ? String(value) : "";
  }

  if (field.type === "array") {
    if (Array.isArray(value)) {
      return value;
    }

    if (typeof value === "string") {
      return value
        .split(/\n|,/)
        .map((item) => item.trim())
        .filter(Boolean);
    }

    return [];
  }

  if (field.type === "json" || field.type === "blocks") {
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) {
        return field.defaultValue ?? (field.type === "blocks" ? [] : {});
      }

      return JSON.parse(trimmed);
    }

    return value ?? field.defaultValue ?? (field.type === "blocks" ? [] : {});
  }

  if (field.type === "richText") {
    if (typeof value === "string") {
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
  existing?: StoredDocument,
) => {
  const data: Record<string, unknown> = {};
  const translatableFields = new Set(getTranslatableFieldNames(collection));

  for (const [fieldName, field] of Object.entries(collection.fields)) {
    if (locale && !translatableFields.has(fieldName)) {
      continue;
    }

    if (!locale && translatableFields.has(fieldName) && input[fieldName] === undefined && existing) {
      continue;
    }

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
    if (field.type !== "slug") {
      continue;
    }

    if (!isEmptyValue(data[fieldName])) {
      data[fieldName] = slugify(String(data[fieldName]));
      continue;
    }

    const sourceField = field.from;
    const sourceValue = sourceField ? data[sourceField] ?? input[sourceField] : undefined;
    if (sourceValue) {
      data[fieldName] = slugify(String(sourceValue));
    }
  }

  for (const [fieldName, field] of Object.entries(collection.fields)) {
    if (!field.required) {
      continue;
    }

    const candidate = data[fieldName] ?? existing?.[fieldName];
    if (isEmptyValue(candidate)) {
      throw new Error(`Field "${fieldName}" is required.`);
    }
  }

  return data;
};

const overlayLocale = (collection: CollectionConfig, doc: StoredDocument, locale?: string | null) => {
  const baseDoc = cloneValue(doc) as Record<string, unknown>;
  const defaultLocale = locale ? locale : null;
  const translations = isObject(doc._translations) ? doc._translations : {};
  const translatableFields = getTranslatableFieldNames(collection);

  if (defaultLocale && translations?.[defaultLocale]) {
    for (const fieldName of translatableFields) {
      const translatedValue = translations[defaultLocale]?.[fieldName];
      if (translatedValue !== undefined) {
        baseDoc[fieldName] = translatedValue;
      }
    }
  }

  return {
    ...baseDoc,
    _availableLocales: [
      ...new Set([
        ...Object.keys(translations ?? {}),
      ]),
    ],
    _locale: defaultLocale ?? null,
  };
};

const matchesWhere = (doc: Record<string, unknown>, where: Record<string, unknown> | undefined) => {
  if (!where) {
    return true;
  }

  return Object.entries(where).every(([key, expected]) => {
    const actual = doc[key];
    if (Array.isArray(actual)) {
      return actual.includes(expected);
    }
    return actual === expected;
  });
};

const assertUniqueFields = (
  store: CollectionStore,
  collection: CollectionConfig,
  values: Record<string, unknown>,
  skipId?: string,
) => {
  const uniqueFields = Object.entries(collection.fields).filter(([, field]) => field.unique);

  for (const [fieldName] of uniqueFields) {
    const candidate = values[fieldName];
    if (candidate === undefined || candidate === null || candidate === "") {
      continue;
    }

    for (const entry of store.docs as StoredDocument[]) {
      if (entry._id === skipId) {
        continue;
      }

      if (entry[fieldName] === candidate) {
        throw new Error(`Field "${fieldName}" must be unique.`);
      }

      const translations = entry._translations ?? {};
      for (const translatedValues of Object.values(translations)) {
        if (translatedValues?.[fieldName] === candidate) {
          throw new Error(`Field "${fieldName}" must be unique.`);
        }
      }
    }
  }
};

const sortDocuments = (docs: Record<string, unknown>[], sort?: FindOptions["sort"]) => {
  if (!sort) {
    return docs;
  }

  const direction = sort.direction === "desc" ? -1 : 1;
  return [...docs].sort((left, right) => {
    const a = left[sort.field];
    const b = right[sort.field];

    if (a === b) {
      return 0;
    }

    return a! > b! ? direction : -direction;
  });
};

const canAccess = async (
  access: AccessConfig | undefined,
  collection: CollectionConfig,
  operation: CMSOperation,
  context: RuntimeContext,
  doc?: StoredDocument | null,
) => {
  const rule = access?.[collection.slug]?.[operation];
  if (!rule) {
    return true;
  }

  return rule({
    user: context.user ?? null,
    doc: doc ?? null,
    operation,
    collection: collection.slug,
  });
};

const getHookContext = (collection: CollectionConfig, operation: string, context: RuntimeContext) => ({
  user: context.user ?? null,
  operation,
  collection: collection.slug,
  timestamp: now(),
});

const pushVersion = (store: CollectionStore, collection: CollectionConfig, doc: StoredDocument) => {
  if (!collection.versions) {
    return;
  }

  const existingVersions = store.versions[doc._id] ?? [];
  const nextVersion: StoredVersion = {
    version: existingVersions.length + 1,
    createdAt: now(),
    snapshot: cloneValue(doc),
  };

  const versions = [...existingVersions, nextVersion];
  store.versions[doc._id] = versions.slice(-collection.versions.max);
};

const getSeedTranslationMap = (seed: Record<string, unknown>) => {
  const raw = seed._translations;
  if (!Array.isArray(raw)) {
    return {};
  }

  return Object.fromEntries(
    raw
      .filter((entry): entry is { locale: string; values: Record<string, unknown> } => isObject(entry) && typeof entry.locale === "string" && isObject(entry.values))
      .map((entry) => [entry.locale, entry.values]),
  );
};

const buildSeedStore = (config: CMSConfig, collection: CollectionConfig): CollectionStore => {
  const seededDocs = (collection.seed ?? []).map((seed) => {
    const createdAt = now();
    const preparedBase = prepareIncomingData(collection, seed, undefined);
    const doc: StoredDocument = {
      _id: typeof seed._id === "string" ? seed._id : createId(),
      _status: seed._status === "published" ? "published" : getDefaultStatus(collection),
      _createdAt: createdAt,
      _updatedAt: createdAt,
      ...preparedBase,
    };

    const translations = getSeedTranslationMap(seed);
    if (Object.keys(translations).length > 0) {
      doc._translations = Object.fromEntries(
        Object.entries(translations).map(([locale, values]) => [locale, prepareIncomingData(collection, values, locale)]),
      );
    }

    return doc;
  });

  const store: CollectionStore = {
    docs: seededDocs,
    versions: {},
  };

  for (const doc of seededDocs) {
    pushVersion(store, collection, doc as StoredDocument);
  }

  return store;
};

const getStore = async (config: CMSConfig, collection: CollectionConfig) =>
  readCollectionStore(config, collection, buildSeedStore(config, collection));

const saveStore = async (config: CMSConfig, collection: CollectionConfig, store: CollectionStore) => {
  await writeCollectionStore(config, collection, store);
};

const normalizeDoc = (collection: CollectionConfig, doc: StoredDocument, locale?: string) => overlayLocale(collection, doc, locale);

export const createCms = (config: CMSConfig, access?: AccessConfig, hooks?: HooksConfig) => {
  const collectionMap = getCollectionMap(config);

  const createCollectionApi = (slug: string) => {
    const collection = ensureCollection(config, slug);

    return {
      async find(options: FindOptions = {}, context: RuntimeContext = {}) {
        const allowed = await canAccess(access, collection, "read", context);
        if (!allowed) {
          throw new Error(`Access denied for ${collection.slug}.`);
        }

        const store = await getStore(config, collection);
        const status = options.status ?? (collection.drafts ? "published" : "any");

        const docs = store.docs
          .map((doc) => normalizeDoc(collection, doc as StoredDocument, options.locale))
          .filter((doc) => (status === "any" ? true : doc._status === status))
          .filter((doc) => matchesWhere(doc, options.where));

        const sorted = sortDocuments(docs, options.sort);
        const offset = options.offset ?? 0;
        const limit = options.limit ?? sorted.length;

        return sorted.slice(offset, offset + limit);
      },

      async findOne(filter: Record<string, unknown> & { locale?: string; status?: FindOptions["status"] }, context: RuntimeContext = {}) {
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

      async findById(id: string, options: { locale?: string; status?: FindOptions["status"] } = {}, context: RuntimeContext = {}) {
        const store = await getStore(config, collection);
        const doc = store.docs.find((entry) => entry._id === id) as StoredDocument | undefined;
        if (!doc) {
          return null;
        }

        const allowed = await canAccess(access, collection, "read", context, doc);
        if (!allowed) {
          throw new Error(`Access denied for ${collection.slug}.`);
        }

        if (options.status && options.status !== "any" && doc._status !== options.status) {
          return null;
        }

        return normalizeDoc(collection, doc, options.locale);
      },

      async create(data: Record<string, unknown>, context: RuntimeContext = {}) {
        const allowed = await canAccess(access, collection, "create", context);
        if (!allowed) {
          throw new Error(`Access denied for ${collection.slug}.`);
        }

        const store = await getStore(config, collection);
        const hookContext = getHookContext(collection, "create", context);
        const preparedInput = prepareIncomingData(collection, data, undefined);
        const transformedInput = hooks?.[collection.slug]?.beforeCreate
          ? await hooks[collection.slug].beforeCreate!(preparedInput, hookContext)
          : preparedInput;

        const createdAt = now();
        const doc: StoredDocument = {
          _id: typeof data._id === "string" ? String(data._id) : createId(),
          _status: data._status === "published" ? "published" : getDefaultStatus(collection),
          _createdAt: createdAt,
          _updatedAt: createdAt,
          ...transformedInput,
        };

        assertUniqueFields(store, collection, doc);
        store.docs.unshift(doc);
        pushVersion(store, collection, doc);
        await saveStore(config, collection, store);
        await hooks?.[collection.slug]?.afterCreate?.(normalizeDoc(collection, doc), hookContext);
        return normalizeDoc(collection, doc);
      },

      async update(id: string, data: Record<string, unknown>, context: RuntimeContext = {}) {
        const store = await getStore(config, collection);
        const index = store.docs.findIndex((entry) => entry._id === id);
        if (index === -1) {
          throw new Error(`${collection.labels.singular} not found.`);
        }

        const existing = store.docs[index] as StoredDocument;
        const allowed = await canAccess(access, collection, "update", context, existing);
        if (!allowed) {
          throw new Error(`Access denied for ${collection.slug}.`);
        }

        const hookContext = getHookContext(collection, "update", context);
        const preparedInput = prepareIncomingData(collection, data, undefined, existing);
        const transformedInput = hooks?.[collection.slug]?.beforeUpdate
          ? await hooks[collection.slug].beforeUpdate!(preparedInput, existing, hookContext)
          : preparedInput;

        const updated: StoredDocument = {
          ...existing,
          ...transformedInput,
          _updatedAt: now(),
        };

        assertUniqueFields(store, collection, updated, id);
        store.docs[index] = updated;
        pushVersion(store, collection, updated);
        await saveStore(config, collection, store);
        await hooks?.[collection.slug]?.afterUpdate?.(normalizeDoc(collection, updated), hookContext);
        return normalizeDoc(collection, updated);
      },

      async delete(id: string, context: RuntimeContext = {}) {
        const store = await getStore(config, collection);
        const existing = store.docs.find((entry) => entry._id === id) as StoredDocument | undefined;
        if (!existing) {
          return;
        }

        const allowed = await canAccess(access, collection, "delete", context, existing);
        if (!allowed) {
          throw new Error(`Access denied for ${collection.slug}.`);
        }

        const hookContext = getHookContext(collection, "delete", context);
        await hooks?.[collection.slug]?.beforeDelete?.(normalizeDoc(collection, existing), hookContext);
        store.docs = store.docs.filter((entry) => entry._id !== id);
        delete store.versions[id];
        await saveStore(config, collection, store);
        await hooks?.[collection.slug]?.afterDelete?.(normalizeDoc(collection, existing), hookContext);
      },

      async publish(id: string, context: RuntimeContext = {}) {
        if (!collection.drafts) {
          throw new Error(`${collection.labels.singular} does not support draft status.`);
        }

        const store = await getStore(config, collection);
        const index = store.docs.findIndex((entry) => entry._id === id);
        if (index === -1) {
          throw new Error(`${collection.labels.singular} not found.`);
        }

        const existing = store.docs[index] as StoredDocument;
        const allowed = await canAccess(access, collection, "publish", context, existing);
        if (!allowed) {
          throw new Error(`Access denied for ${collection.slug}.`);
        }

        const hookContext = getHookContext(collection, "publish", context);
        const maybeTransformed = hooks?.[collection.slug]?.beforePublish
          ? await hooks[collection.slug].beforePublish!(normalizeDoc(collection, existing), hookContext)
          : normalizeDoc(collection, existing);

        const updated: StoredDocument = {
          ...(existing as StoredDocument),
          ...(maybeTransformed as StoredDocument),
          _status: "published",
          _updatedAt: now(),
        };

        store.docs[index] = updated;
        pushVersion(store, collection, updated);
        await saveStore(config, collection, store);
        await hooks?.[collection.slug]?.afterPublish?.(normalizeDoc(collection, updated), hookContext);
        return normalizeDoc(collection, updated);
      },

      async unpublish(id: string, context: RuntimeContext = {}) {
        if (!collection.drafts) {
          throw new Error(`${collection.labels.singular} does not support draft status.`);
        }

        const store = await getStore(config, collection);
        const index = store.docs.findIndex((entry) => entry._id === id);
        if (index === -1) {
          throw new Error(`${collection.labels.singular} not found.`);
        }

        const existing = store.docs[index] as StoredDocument;
        const updated: StoredDocument = {
          ...existing,
          _status: "draft",
          _updatedAt: now(),
        };

        store.docs[index] = updated;
        pushVersion(store, collection, updated);
        await saveStore(config, collection, store);
        return normalizeDoc(collection, updated);
      },

      async count(filter: Omit<FindOptions, "limit" | "offset" | "sort"> = {}, context: RuntimeContext = {}) {
        const docs = await this.find(filter, context);
        return docs.length;
      },

      async versions(id: string) {
        const store = await getStore(config, collection);
        return store.versions[id] ?? [];
      },

      async restore(id: string, versionNumber: number, context: RuntimeContext = {}) {
        const store = await getStore(config, collection);
        const versions = store.versions[id] ?? [];
        const version = versions.find((entry) => entry.version === versionNumber);
        if (!version) {
          throw new Error(`Version ${versionNumber} not found.`);
        }

        return this.update(id, version.snapshot, context);
      },

      async getTranslations(id: string) {
        const store = await getStore(config, collection);
        const doc = store.docs.find((entry) => entry._id === id) as StoredDocument | undefined;
        return doc?._translations ?? {};
      },

      async upsertTranslation(id: string, locale: string, data: Record<string, unknown>, context: RuntimeContext = {}) {
        const store = await getStore(config, collection);
        const index = store.docs.findIndex((entry) => entry._id === id);
        if (index === -1) {
          throw new Error(`${collection.labels.singular} not found.`);
        }

        const existing = store.docs[index] as StoredDocument;
        const allowed = await canAccess(access, collection, "update", context, existing);
        if (!allowed) {
          throw new Error(`Access denied for ${collection.slug}.`);
        }

        const translatableFields = getTranslatableFieldNames(collection);
        const translatedValues = prepareIncomingData(collection, data, locale, existing);
        const filteredTranslation = pick(translatedValues, translatableFields);

        const updated: StoredDocument = {
          ...existing,
          _updatedAt: now(),
          _translations: {
            ...(existing._translations ?? {}),
            [locale]: filteredTranslation,
          },
        };

        assertUniqueFields(store, collection, updated, id);
        store.docs[index] = updated;
        pushVersion(store, collection, updated);
        await saveStore(config, collection, store);
        return normalizeDoc(collection, updated, locale);
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
      getLocales: () => config.locales,
      isTranslatableField: (slug: string, fieldName: string) => {
        const collection = ensureCollection(config, slug);
        const field = collection.fields[fieldName];
        return !!field?.translatable && !isStructuralField(field);
      },
    },
  };
};
