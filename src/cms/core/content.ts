import { cms } from "../.generated/api";

/** Document type — all field values are accessible without casting */
export type Doc = Record<string, any>;

type ContentResult = {
  doc: Doc | null;
  isPreview: boolean;
  blocks: Array<Record<string, any>>;
};

export async function findContent(collection: string, slug: string, url: URL): Promise<ContentResult> {
  const isPreview = url.searchParams.get("preview") === "true";
  const api = (cms as Record<string, any>)[collection];
  if (!api) return { doc: null, isPreview, blocks: [] };

  const doc = await api.findOne({
    slug,
    status: isPreview ? "any" : "published",
  });

  const blocks = parseBlocks(doc?.blocks);

  return { doc, isPreview, blocks };
}

export function parseBlocks(value: unknown): Array<Record<string, any>> {
  if (!value) return [];
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function parseList<T = Record<string, any>>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

export function cacheTags(collection: string, docId: string): string[] {
  const singular = collection.endsWith("s") ? collection.slice(0, -1) : collection;
  return [collection, `${singular}:${docId}`];
}
