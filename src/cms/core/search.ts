import { and, eq, sql } from "drizzle-orm";

import type { CollectionConfig, FieldConfig, RichTextDocument, SearchableConfig } from "./define";
import { getLabelField, getTranslatableFieldNames } from "./define";
import { getDb } from "./runtime";
import { getSchema } from "./schema";
import { richTextToPlainText } from "./values";

export type SearchResult = {
  collection: string;
  docId: string;
  locale: string | null;
  title: string;
  url: string;
  snippet: string;
  rank: number;
};

export type SearchOptions = {
  locale?: string;
  collections?: string[];
  limit?: number;
};

const DEFAULT_SEARCHABLE_TYPES = new Set(["text", "slug", "richText", "blocks", "array"]);

let schemaReady = false;

export const resetSearchSchemaCache = () => {
  schemaReady = false;
};

export const ensureSearchSchema = async (): Promise<void> => {
  if (schemaReady) return;
  const db = await getDb();
  await db.run(
    sql`CREATE VIRTUAL TABLE IF NOT EXISTS cms_search_index USING fts5(
      title,
      body,
      collection UNINDEXED,
      doc_id UNINDEXED,
      locale UNINDEXED,
      url UNINDEXED,
      status UNINDEXED,
      tokenize = 'unicode61 remove_diacritics 2'
    )`,
  );
  schemaReady = true;
};

const isJsonField = (field: FieldConfig) =>
  field.type === "richText" ||
  field.type === "array" ||
  field.type === "json" ||
  field.type === "blocks" ||
  (field.type === "relation" && field.hasMany);

const parseJsonFields = (collection: CollectionConfig, row: Record<string, unknown>) => {
  const out: Record<string, unknown> = { ...row };
  for (const [name, field] of Object.entries(collection.fields)) {
    if (isJsonField(field) && typeof out[name] === "string") {
      try {
        out[name] = JSON.parse(out[name] as string);
      } catch {
        // leave as-is
      }
    }
  }
  return out;
};

const extractStrings = (value: unknown): string => {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(extractStrings).filter(Boolean).join(" ");
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .filter(([key]) => key !== "type")
      .map(([, v]) => extractStrings(v))
      .filter(Boolean)
      .join(" ");
  }
  return "";
};

const flattenField = (field: FieldConfig, value: unknown): string => {
  if (value == null) return "";
  if (field.type === "richText") {
    try {
      return richTextToPlainText(value as RichTextDocument);
    } catch {
      return "";
    }
  }
  if (field.type === "blocks" || field.type === "array") {
    return extractStrings(value);
  }
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
};

export const isCollectionSearchable = (collection: CollectionConfig): boolean => !!collection.searchable;

const resolveSearchableFieldNames = (collection: CollectionConfig): string[] => {
  const cfg: SearchableConfig | undefined = collection.searchable;
  if (!cfg) return [];
  if (cfg === true) {
    return Object.entries(collection.fields)
      .filter(([, field]) => DEFAULT_SEARCHABLE_TYPES.has(field.type))
      .map(([name]) => name);
  }
  return cfg.fields;
};

const buildUrl = (collection: CollectionConfig, doc: Record<string, unknown>, locale: string | null): string => {
  const slugValue = String(doc.slug ?? "");
  const prefix = collection.pathPrefix ? `/${collection.pathPrefix}` : "";
  const path = slugValue === "home" ? "" : `/${slugValue}`;
  const localePrefix = locale ? `/${locale}` : "";
  return `${localePrefix}${prefix}${path}`;
};

/**
 * Re-indexes a single document across all supported locales. Always deletes existing rows first,
 * then inserts fresh rows for each locale where the document is published. Idempotent.
 * Errors are logged but never thrown — search must never break a write.
 */
export const indexDocument = async (collection: CollectionConfig, docId: string, locales: string[]): Promise<void> => {
  if (!isCollectionSearchable(collection)) return;
  try {
    await ensureSearchSchema();
    const db = await getDb();
    const schema = getSchema();
    const tables = schema.cmsTables[collection.slug] as
      | {
          main: any;
          translations?: any;
        }
      | undefined;
    if (!tables) return;

    await db.run(sql`DELETE FROM cms_search_index WHERE collection = ${collection.slug} AND doc_id = ${docId}`);

    const rows = await db.select().from(tables.main).where(eq(tables.main._id, docId)).limit(1);
    if (rows.length === 0) return;
    const base = parseJsonFields(collection, rows[0] as Record<string, unknown>);

    // Published-only — if the collection supports drafts and this doc isn't published, skip.
    if (collection.drafts && base._status !== "published") return;

    const translatableFields = getTranslatableFieldNames(collection);
    const hasTranslations = !!tables.translations && translatableFields.length > 0;
    const localesToIndex: Array<string | null> = hasTranslations && locales.length > 0 ? [...locales] : [null];

    const searchableFieldNames = resolveSearchableFieldNames(collection);
    const labelField = getLabelField(collection);

    for (const locale of localesToIndex) {
      const doc: Record<string, unknown> = { ...base };
      if (locale && hasTranslations) {
        const trRows = await db
          .select()
          .from(tables.translations)
          .where(and(eq(tables.translations._entityId, docId), eq(tables.translations._languageCode, locale)))
          .limit(1);
        if (trRows.length > 0) {
          const translation = parseJsonFields(collection, trRows[0] as Record<string, unknown>);
          for (const fieldName of translatableFields) {
            if (translation[fieldName] !== undefined && translation[fieldName] !== null) {
              doc[fieldName] = translation[fieldName];
            }
          }
        }
      }

      const title = String(doc[labelField] ?? doc.slug ?? docId);
      const bodyParts = searchableFieldNames
        .map((name) => {
          const field = collection.fields[name];
          if (!field) return "";
          return flattenField(field, doc[name]);
        })
        .map((chunk) => chunk.trim())
        .filter(Boolean);
      const body = bodyParts.join("\n\n");
      const url = buildUrl(collection, doc, locale);

      await db.run(
        sql`INSERT INTO cms_search_index (title, body, collection, doc_id, locale, url, status)
            VALUES (${title}, ${body}, ${collection.slug}, ${docId}, ${locale ?? ""}, ${url}, 'published')`,
      );
    }
  } catch (error) {
    console.warn("[search] failed to index", collection.slug, docId, error);
  }
};

export const removeDocument = async (collectionSlug: string, docId: string): Promise<void> => {
  try {
    await ensureSearchSchema();
    const db = await getDb();
    await db.run(sql`DELETE FROM cms_search_index WHERE collection = ${collectionSlug} AND doc_id = ${docId}`);
  } catch (error) {
    console.warn("[search] failed to remove", collectionSlug, docId, error);
  }
};

/**
 * Quote each term for FTS5 prefix match and drop problematic characters.
 * Example: `hello world` → `"hello"* "world"*`
 */
const toFtsQuery = (raw: string): string => {
  return raw
    .replace(/["'()]/g, " ")
    .split(/\s+/)
    .map((term) => term.trim())
    .filter(Boolean)
    .map((term) => `"${term}"*`)
    .join(" ");
};

export const search = async (query: string, options: SearchOptions = {}): Promise<SearchResult[]> => {
  const fts = toFtsQuery(query);
  if (!fts) return [];
  await ensureSearchSchema();
  const db = await getDb();

  const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);

  const conditions: Array<ReturnType<typeof sql>> = [sql`cms_search_index MATCH ${fts}`];
  if (options.locale) {
    conditions.push(sql`locale = ${options.locale}`);
  }
  if (options.collections && options.collections.length > 0) {
    const values = options.collections.map((slug) => sql`${slug}`);
    conditions.push(sql`collection IN (${sql.join(values, sql`, `)})`);
  }
  const whereClause = sql.join(conditions, sql` AND `);

  const rows = (await db.all(
    sql`SELECT
      collection,
      doc_id AS "docId",
      locale,
      title,
      url,
      snippet(cms_search_index, 1, '<mark>', '</mark>', '…', 12) AS snippet,
      bm25(cms_search_index) AS rank
    FROM cms_search_index
    WHERE ${whereClause}
    ORDER BY rank
    LIMIT ${limit}`,
  )) as Array<{
    collection: string;
    docId: string;
    locale: string;
    title: string;
    url: string;
    snippet: string;
    rank: number;
  }>;

  return rows.map((row) => ({
    collection: row.collection,
    docId: row.docId,
    locale: row.locale && row.locale !== "" ? row.locale : null,
    title: row.title,
    url: row.url,
    snippet: row.snippet,
    rank: row.rank,
  }));
};

/**
 * Full rebuild: clears the index and re-indexes every document in every searchable collection.
 * Safe to run at any time; used by `pnpm cms:reindex`.
 */
export const reindexAll = async (collections: CollectionConfig[], locales: string[]): Promise<{ indexed: number }> => {
  await ensureSearchSchema();
  const db = await getDb();
  await db.run(sql`DELETE FROM cms_search_index`);

  const schema = getSchema();
  let indexed = 0;

  for (const collection of collections) {
    if (!isCollectionSearchable(collection)) continue;
    const tables = schema.cmsTables[collection.slug] as { main: any } | undefined;
    if (!tables) continue;

    const rows = await db.select().from(tables.main);
    for (const row of rows) {
      const doc = row as Record<string, unknown>;
      await indexDocument(collection, String(doc._id), locales);
      indexed++;
    }
  }

  return { indexed };
};
