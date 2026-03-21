import { cms } from "../.generated/api";

type ContentResult = {
  doc: Record<string, unknown> | null;
  isPreview: boolean;
  blocks: Array<Record<string, unknown>>;
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

export function parseBlocks(value: unknown): Array<Record<string, unknown>> {
  if (!value) return [];
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function cacheTags(collection: string, docId: string): string[] {
  const singular = collection.endsWith("s") ? collection.slice(0, -1) : collection;
  return [collection, `${singular}:${docId}`];
}
