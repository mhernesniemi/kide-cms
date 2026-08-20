import { eq, or, sql, type SQL } from "drizzle-orm";

import { getLabelField, type CMSConfig, type CollectionConfig, type FieldConfig } from "./define";
import { getDb } from "./runtime";
import { getSchema } from "./schema";

/**
 * Where an asset is used. Structurally identical to the admin's `ReverseRef`
 * so the existing "Referenced by" list component renders it unchanged.
 */
export type AssetUsageRef = {
  collectionSlug: string;
  collectionLabel: string;
  docs: Array<{ _id: string; label: string }>;
};

export type AssetUsageResult = {
  refs: AssetUsageRef[];
  /**
   * Collections whose scan failed (missing table, schema drift). Their documents
   * were not searched, so `refs` may under-report. Never treat a non-empty
   * `incomplete` as "not used" — that is how a referenced asset gets deleted.
   */
  incomplete: string[];
};

/** Matching rows pulled per collection before attribution. Generous — a match is already rare. */
const SCAN_CAP = 1000;

/**
 * The config is registered by `createCms()` so `assets.delete()` can check usage
 * without every caller threading the config through.
 */
let usageConfig: CMSConfig | null = null;

export const setUsageConfig = (config: CMSConfig) => {
  usageConfig = config;
};

export const getUsageConfig = (): CMSConfig | null => usageConfig;

/** Field types serialized to JSON in a single text column — matched by substring. */
const JSON_FIELD_TYPES = new Set(["richText", "content", "array", "json", "blocks"]);

/**
 * Can this field hold a storagePath anywhere inside it? Keeps the query narrow —
 * a `blocks` field whose block types declare no image never gets scanned.
 */
const fieldCanHoldAsset = (field: FieldConfig, depth = 0): boolean => {
  if (depth > 6) return false;
  switch (field.type) {
    case "image":
      return true;
    // Rich text carries inline `{ type: "image", src }` nodes whatever the sub-fields say.
    case "richText":
    case "content":
      return true;
    case "array":
      return fieldCanHoldAsset(field.of, depth + 1);
    case "json":
      // Freeform json has no declared shape — assume it might.
      return field.itemFields ? Object.values(field.itemFields).some((f) => fieldCanHoldAsset(f, depth + 1)) : true;
    case "blocks":
      return Object.values(field.types).some((blockFields) =>
        Object.values(blockFields).some((f) => fieldCanHoldAsset(f, depth + 1)),
      );
    default:
      return false;
  }
};

type UsageTargets = { exact: string[]; contains: string[] };

const getUsageTargets = (collection: CollectionConfig): UsageTargets => {
  const exact: string[] = [];
  const contains: string[] = [];

  for (const [name, field] of Object.entries(collection.fields)) {
    if (field.type === "image") exact.push(name);
    else if (JSON_FIELD_TYPES.has(field.type) && fieldCanHoldAsset(field)) contains.push(name);
  }

  return { exact, contains };
};

const hasUsageTargets = (targets: UsageTargets) => targets.exact.length > 0 || targets.contains.length > 0;

type ScanColumn = { key: string; column: any; exact: boolean };

const collectColumns = (table: Record<string, any>, targets: UsageTargets, includePublished: boolean): ScanColumn[] => {
  const columns: ScanColumn[] = [];

  for (const name of targets.exact) {
    if (table[name]) columns.push({ key: `c${columns.length}`, column: table[name], exact: true });
  }
  for (const name of targets.contains) {
    if (table[name]) columns.push({ key: `c${columns.length}`, column: table[name], exact: false });
  }
  // The published snapshot is what the live site serves while a doc has unpublished
  // changes, so a path living only in there still renders — and still counts as used.
  if (includePublished && table._published) {
    columns.push({ key: `c${columns.length}`, column: table._published, exact: false });
  }

  return columns;
};

/**
 * `instr` is a literal substring search — no LIKE wildcards to escape, and the
 * storagePath is a random nanoid so a substring hit is never a false positive.
 */
const matchExpression = (entry: ScanColumn, path: string): SQL =>
  entry.exact ? eq(entry.column, path) : sql`instr(${entry.column}, ${path}) > 0`;

/**
 * Document ids per storagePath, per collection. One query per table — the DB does
 * the filtering; JS only attributes each matched row back to the path(s) it matched.
 */
const scanUsage = async (
  config: CMSConfig,
  paths: string[],
): Promise<{ hits: Map<string, Array<{ collection: CollectionConfig; docId: string }>>; incomplete: string[] }> => {
  const hits = new Map<string, Array<{ collection: CollectionConfig; docId: string }>>();
  const incomplete: string[] = [];
  for (const path of paths) hits.set(path, []);
  if (paths.length === 0) return { hits, incomplete };

  const db = await getDb();
  const { cmsTables } = getSchema();

  for (const collection of config.collections) {
    const targets = getUsageTargets(collection);
    if (!hasUsageTargets(targets)) continue;

    const tables = cmsTables[collection.slug];
    if (!tables?.main) continue;

    const perPath = new Map<string, Set<string>>();

    const scanTable = async (table: Record<string, any>, idColumn: any, includePublished: boolean) => {
      const columns = collectColumns(table, targets, includePublished);
      if (columns.length === 0) return;

      const conditions = paths.flatMap((path) => columns.map((entry) => matchExpression(entry, path)));
      const selection: Record<string, any> = { __id: idColumn };
      for (const entry of columns) selection[entry.key] = entry.column;

      const rows = await db
        .select(selection)
        .from(table)
        .where(or(...conditions))
        .limit(SCAN_CAP);

      for (const row of rows as Array<Record<string, unknown>>) {
        const docId = String(row.__id ?? "");
        if (!docId) continue;
        for (const path of paths) {
          const matched = columns.some((entry) => {
            const value = row[entry.key];
            return typeof value === "string" && value.includes(path);
          });
          if (!matched) continue;
          if (!perPath.has(path)) perPath.set(path, new Set());
          perPath.get(path)!.add(docId);
        }
      }
    };

    try {
      await scanTable(tables.main, tables.main._id, !!collection.drafts);
      if (tables.translations) await scanTable(tables.translations, tables.translations._entityId, false);
    } catch (error) {
      // A missing or mid-migration table must not break the whole check — but it must
      // not pass as "no usage" either, so record it and let the caller refuse to
      // conclude anything. Silence here is what deletes a referenced asset.
      incomplete.push(collection.slug);
      console.warn(`[cms] asset usage scan failed for collection "${collection.slug}":`, error);
      continue;
    }

    for (const [path, docIds] of perPath) {
      const bucket = hits.get(path);
      if (!bucket) continue;
      for (const docId of docIds) bucket.push({ collection, docId });
    }
  }

  return { hits, incomplete };
};

/** Resolves display labels for matched documents, one query per collection. */
const resolveLabels = async (
  entries: Array<{ collection: CollectionConfig; docId: string }>,
): Promise<AssetUsageRef[]> => {
  if (entries.length === 0) return [];

  const db = await getDb();
  const { cmsTables } = getSchema();
  const bySlug = new Map<string, { collection: CollectionConfig; docIds: string[] }>();

  for (const entry of entries) {
    const existing = bySlug.get(entry.collection.slug);
    if (existing) existing.docIds.push(entry.docId);
    else bySlug.set(entry.collection.slug, { collection: entry.collection, docIds: [entry.docId] });
  }

  const refs: AssetUsageRef[] = [];

  for (const { collection, docIds } of bySlug.values()) {
    const tables = cmsTables[collection.slug];
    const labelField = getLabelField(collection);
    const labels = new Map<string, string>();

    if (tables?.main?.[labelField]) {
      try {
        const rows = await db
          .select({ __id: tables.main._id, __label: tables.main[labelField] })
          .from(tables.main)
          .where(or(...docIds.map((id) => eq(tables.main._id, id))));
        for (const row of rows as Array<Record<string, unknown>>) {
          labels.set(String(row.__id), String(row.__label ?? "").trim());
        }
      } catch {
        // fall through to id labels
      }
    }

    refs.push({
      collectionSlug: collection.slug,
      collectionLabel: collection.singleton ? collection.labels.singular : collection.labels.plural,
      docs: docIds.map((docId) => ({
        _id: docId,
        label: collection.singleton ? collection.labels.singular : labels.get(docId) || docId,
      })),
    });
  }

  return refs;
};

/** Every document that references this asset's storagePath. */
export const findAssetUsage = async (config: CMSConfig, storagePath: string): Promise<AssetUsageResult> => {
  if (!storagePath) return { refs: [], incomplete: [] };
  const { hits, incomplete } = await scanUsage(config, [storagePath]);
  return { refs: await resolveLabels(hits.get(storagePath) ?? []), incomplete };
};

/** Usage counts for many assets at once — one pass per collection, not per asset. */
export const countAssetUsage = async (
  config: CMSConfig,
  storagePaths: string[],
): Promise<{ counts: Record<string, number>; incomplete: string[] }> => {
  const unique = [...new Set(storagePaths.filter(Boolean))];
  const counts: Record<string, number> = Object.fromEntries(unique.map((path) => [path, 0]));
  if (unique.length === 0) return { counts, incomplete: [] };

  const { hits, incomplete } = await scanUsage(config, unique);
  for (const [path, entries] of hits) counts[path] = entries.length;
  return { counts, incomplete };
};

/**
 * Raised by `assets.delete()` when the asset is still referenced — or when usage
 * could not be established — and `force` was not set.
 */
export class AssetInUseError extends Error {
  readonly usage: AssetUsageRef[];
  readonly incomplete: string[];
  readonly assetId: string;

  constructor(assetId: string, usage: AssetUsageRef[], incomplete: string[] = []) {
    const total = usage.reduce((sum, ref) => sum + ref.docs.length, 0);
    super(
      total > 0
        ? `Asset is used by ${total} document${total === 1 ? "" : "s"}.`
        : `Could not verify where this asset is used (${incomplete.join(", ")} could not be searched).`,
    );
    this.name = "AssetInUseError";
    this.assetId = assetId;
    this.usage = usage;
    this.incomplete = incomplete;
  }
}
