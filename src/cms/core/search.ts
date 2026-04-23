import { and, eq, sql } from "drizzle-orm";

import type { CollectionConfig, FieldConfig, RichTextDocument, SearchableConfig } from "./define";
import { getLabelField, getTranslatableFieldNames } from "./define";
import { getDb } from "./runtime";
import { getSchema } from "./schema";
import { escapeHtml, richTextToPlainText } from "./values";

// Control-character delimiters for FTS5's snippet() — impossible in real content,
// so escapeHtml + split/join produces safe HTML with <mark>…</mark> around matches.
const MARK_OPEN = "M";
const MARK_CLOSE = "E";

export type SearchResult = {
  collection: string;
  docId: string;
  locale: string | null;
  title: string;
  url: string;
  snippet: string;
  publishedAt: string | null;
  rank: number;
};

export type SearchSort = "relevance" | "title" | "date";

export type SearchOptions = {
  locale?: string;
  collections?: string[];
  docIds?: string[];
  sort?: SearchSort;
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

  // Schema migration: if the existing table was created with an older column set
  // or tokenizer, drop it so we can recreate. Rows are rebuilt on the next
  // indexDocument / reindex.
  const existing = (await db.all(
    sql`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'cms_search_index'`,
  )) as Array<{ sql: string }>;
  const existingSql = existing.length > 0 ? String(existing[0].sql) : "";
  const schemaUpToDate = existingSql.includes("published_at") && existingSql.includes("trigram");
  if (existing.length > 0 && !schemaUpToDate) {
    console.log("[search] FTS5 schema outdated, rebuilding table (run pnpm cms:reindex to repopulate)");
    await db.run(sql`DROP TABLE cms_search_index`);
  }

  // Trigram tokenizer indexes every 3-char slice, so MATCH matches substrings
  // of tokens (handles compound words) and overlapping trigrams give partial
  // scores for typos.
  await db.run(
    sql`CREATE VIRTUAL TABLE IF NOT EXISTS cms_search_index USING fts5(
      title,
      body,
      collection UNINDEXED,
      doc_id UNINDEXED,
      locale UNINDEXED,
      url UNINDEXED,
      status UNINDEXED,
      published_at UNINDEXED,
      tokenize = 'trigram'
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
      const publishedAt = String(doc._publishedAt ?? doc._createdAt ?? "");

      await db.run(
        sql`INSERT INTO cms_search_index (title, body, collection, doc_id, locale, url, status, published_at)
            VALUES (${title}, ${body}, ${collection.slug}, ${docId}, ${locale ?? ""}, ${url}, 'published', ${publishedAt})`,
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

const termToTrigrams = (term: string): string[] => {
  const out: string[] = [];
  for (let i = 0; i <= term.length - 3; i++) out.push(term.slice(i, i + 3));
  return out;
};

/**
 * Build an FTS5 query for the trigram tokenizer. Each term expands to
 * `("term" OR "tri" OR "rig" OR …)` — matching either the literal substring
 * or any of its overlapping trigrams. The trigram OR is what catches typos
 * (most edits leave most trigrams intact); the JS fuzzy re-rank then puts
 * the best-matching row on top. Terms shorter than 3 chars are dropped
 * because the trigram tokenizer cannot index them.
 */
const toFtsQuery = (raw: string): string => {
  const terms = raw
    .replace(/["'()]/g, " ")
    .split(/\s+/)
    .map((term) => term.trim())
    .filter((term) => term.length >= 3);
  if (terms.length === 0) return "";

  return terms
    .map((term) => {
      const parts = [`"${term}"`, ...termToTrigrams(term).map((t) => `"${t}"`)];
      return `(${parts.join(" OR ")})`;
    })
    .join(" ");
};

/**
 * Classic two-row Levenshtein — cheap for short strings, O(|a|·|b|) time.
 * Used for fuzzy re-ranking after trigram match.
 */
const levenshtein = (a: string, b: string): number => {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev = new Array(b.length + 1);
  let curr = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
};

/**
 * Max absolute edit distance we accept before declaring a term to have no
 * real match. Tight for short terms so noise like "kissa" ↔ "heissan"
 * (distance 2-3) gets filtered, looser for longer terms where 2 edits is
 * still a plausible typo.
 */
const distanceCap = (termLength: number) => (termLength <= 5 ? 1 : 2);

/**
 * Best edit distance between `term` and the most relevant substring of
 * `word`. Candidate substrings are anchored to positions where any trigram
 * of the query term actually appears in the word — this is what lets
 * "kieko" match inside "jääkiekko" (the trigram "kie" pins the window to
 * position 3, so we compare "kiekk" / "kiekko" to "kieko" and find dist 1)
 * while still rejecting "kissa" in "heissan" (no query trigram anchors to
 * a substring that's close enough).
 */
const bestDistance = (term: string, word: string): number => {
  if (word === term) return 0;
  if (word.includes(term)) return 0;
  let best = levenshtein(term, word);
  if (best === 0 || word.length <= term.length) return best;

  const trigrams = termToTrigrams(term);
  if (trigrams.length === 0) return best;

  const anchors = new Set<number>();
  for (const tri of trigrams) {
    for (let i = word.indexOf(tri); i !== -1; i = word.indexOf(tri, i + 1)) {
      anchors.add(i);
    }
  }

  for (const pos of anchors) {
    for (const len of [term.length, term.length + 1]) {
      if (pos + len > word.length) continue;
      const d = levenshtein(term, word.substring(pos, pos + len));
      if (d < best) best = d;
      if (best === 0) return 0;
    }
  }
  return best;
};

/**
 * Score a doc against the query: for each ≥3-char query term, find the best
 * matching word in the doc. Returns null if any term has no match within
 * its `distanceCap`, meaning the doc is not a real hit and should be dropped.
 * Otherwise returns a summed-distance score where lower is better (0 = all
 * terms substring-matched in the doc).
 */
const fuzzyScore = (queryTerms: string[], docText: string): number | null => {
  if (queryTerms.length === 0) return 0;
  const words = docText
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  if (words.length === 0) return null;

  let total = 0;
  for (const term of queryTerms) {
    const cap = distanceCap(term.length);
    let best = Infinity;
    for (const word of words) {
      const d = bestDistance(term, word);
      if (d < best) best = d;
      if (best === 0) break;
    }
    if (best > cap) return null;
    total += best;
  }
  return total;
};

export const search = async (query: string, options: SearchOptions = {}): Promise<SearchResult[]> => {
  const fts = toFtsQuery(query);
  if (!fts) return [];
  await ensureSearchSchema();
  const db = await getDb();

  const limit = Math.min(Math.max(options.limit ?? 20, 1), 200);

  const conditions: Array<ReturnType<typeof sql>> = [sql`cms_search_index MATCH ${fts}`];
  if (options.locale) {
    conditions.push(sql`locale = ${options.locale}`);
  }
  if (options.collections && options.collections.length > 0) {
    const values = options.collections.map((slug) => sql`${slug}`);
    conditions.push(sql`collection IN (${sql.join(values, sql`, `)})`);
  }
  if (options.docIds && options.docIds.length > 0) {
    const values = options.docIds.map((id) => sql`${id}`);
    conditions.push(sql`doc_id IN (${sql.join(values, sql`, `)})`);
  }
  const whereClause = sql.join(conditions, sql` AND `);

  const orderBy =
    options.sort === "title"
      ? sql`title COLLATE NOCASE ASC`
      : options.sort === "date"
        ? // Empty strings sort to the end so docs with a real publishedAt come first.
          sql`CASE WHEN published_at = '' THEN 1 ELSE 0 END, published_at DESC`
        : sql`bm25(cms_search_index)`;

  const rows = (await db.all(
    sql`SELECT
      collection,
      doc_id AS "docId",
      locale,
      title,
      url,
      published_at AS "publishedAt",
      snippet(cms_search_index, 1, ${MARK_OPEN}, ${MARK_CLOSE}, '…', 12) AS snippet,
      bm25(cms_search_index) AS rank
    FROM cms_search_index
    WHERE ${whereClause}
    ORDER BY ${orderBy}
    LIMIT ${limit}`,
  )) as Array<{
    collection: string;
    docId: string;
    locale: string;
    title: string;
    url: string;
    publishedAt: string;
    snippet: string;
    rank: number;
  }>;

  const mapped = rows.map((row) => ({
    collection: row.collection,
    docId: row.docId,
    locale: row.locale && row.locale !== "" ? row.locale : null,
    title: row.title,
    url: row.url,
    publishedAt: row.publishedAt && row.publishedAt !== "" ? row.publishedAt : null,
    snippet: escapeHtml(row.snippet).split(MARK_OPEN).join("<mark>").split(MARK_CLOSE).join("</mark>"),
    rank: row.rank,
    // Raw snippet with FTS5 markers stripped, for fuzzy scoring
    _scoringText: `${row.title} ${row.snippet.split(MARK_OPEN).join("").split(MARK_CLOSE).join("")}`,
  }));

  // Fuzzy re-rank for relevance mode: scores each candidate by min edit
  // distance to words in title + snippet, with bm25 as tiebreaker. Rows where
  // any query term has no word within the distance cap are dropped entirely —
  // this is how we keep "kissa" from returning "heissan" just because both
  // share the trigram "ssa".
  if ((options.sort ?? "relevance") === "relevance") {
    const queryTerms = query
      .toLowerCase()
      .replace(/["'()]/g, " ")
      .split(/\s+/)
      .map((t) => t.trim())
      .filter((t) => t.length >= 3);
    const scored = mapped
      .map((row) => ({ row, fuzz: fuzzyScore(queryTerms, row._scoringText) }))
      .filter((entry): entry is { row: (typeof mapped)[number]; fuzz: number } => entry.fuzz !== null);
    scored.sort((a, b) => {
      if (a.fuzz !== b.fuzz) return a.fuzz - b.fuzz;
      return a.row.rank - b.row.rank;
    });
    return scored.map(({ row }) => {
      const { _scoringText, ...rest } = row;
      return rest;
    });
  }

  return mapped.map((row) => {
    const { _scoringText, ...rest } = row;
    return rest;
  });
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
