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
