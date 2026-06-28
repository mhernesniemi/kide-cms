import type { CMSConfig, CollectionConfig, FieldConfig } from "./define";

export const SHARED_SECTIONS_COLLECTION = "shared-sections";
export const SHARED_BLOCK_TYPE = "__shared";

export type SharedBlockReference = {
  type: typeof SHARED_BLOCK_TYPE;
  ref: string;
  title?: string;
  blockType?: string;
};

export type SharedSectionOption = {
  id: string;
  title: string;
  blockType: string;
  status?: string;
};

export const isSharedBlockReference = (value: unknown): value is SharedBlockReference =>
  !!value &&
  typeof value === "object" &&
  (value as Record<string, unknown>).type === SHARED_BLOCK_TYPE &&
  typeof (value as Record<string, unknown>).ref === "string" &&
  String((value as Record<string, unknown>).ref).length > 0;

export const getSharedSectionCacheTags = (id: string) => [SHARED_SECTIONS_COLLECTION, `shared-section:${id}`];

export const getSharedBlockTypes = (config: CMSConfig): Record<string, Record<string, FieldConfig>> => {
  const types: Record<string, Record<string, FieldConfig>> = {};

  for (const collection of config.collections) {
    if (collection.slug === SHARED_SECTIONS_COLLECTION) continue;
    for (const field of Object.values(collection.fields)) {
      const blockTypes =
        field.type === "blocks" && field.shared !== false
          ? field.types
          : field.type === "content"
            ? field.blocks
            : null;
      if (!blockTypes) continue;

      for (const [typeName, typeFields] of Object.entries(blockTypes)) {
        if (!types[typeName]) types[typeName] = typeFields;
      }
    }
  }

  return types;
};

export const extractSharedSectionRefsFromBlocks = (value: unknown): string[] => {
  const blocks = Array.isArray(value) ? value : [];
  return blocks
    .filter(isSharedBlockReference)
    .map((block) => block.ref)
    .filter(Boolean);
};

export const extractSharedSectionRefsFromContent = (value: unknown): string[] => {
  if (!value || typeof value !== "object") return [];
  const children = (value as { children?: unknown }).children;
  if (!Array.isArray(children)) return [];

  return children
    .filter((node): node is { type: "block"; blockType: string; fields?: Record<string, unknown> } => {
      if (!node || typeof node !== "object") return false;
      const candidate = node as Record<string, unknown>;
      return candidate.type === "block" && candidate.blockType === SHARED_BLOCK_TYPE;
    })
    .map((node) => String(node.fields?.ref ?? ""))
    .filter(Boolean);
};

export const extractSharedSectionRefsFromDocument = (
  collection: Pick<CollectionConfig, "fields">,
  doc: Record<string, unknown>,
): string[] => {
  const refs = new Set<string>();

  for (const [fieldName, field] of Object.entries(collection.fields)) {
    const value = doc[fieldName];
    const fieldRefs =
      field.type === "blocks" && field.shared !== false
        ? extractSharedSectionRefsFromBlocks(value)
        : field.type === "content"
          ? extractSharedSectionRefsFromContent(value)
          : [];
    for (const ref of fieldRefs) refs.add(ref);
  }

  return [...refs];
};

export const getSharedSectionTagsFromBlocks = (value: unknown): string[] =>
  extractSharedSectionRefsFromBlocks(value).flatMap(getSharedSectionCacheTags);
