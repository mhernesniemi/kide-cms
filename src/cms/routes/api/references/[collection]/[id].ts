import type { APIRoute } from "astro";
import config from "virtual:kide/config";
import { cms } from "virtual:kide/api";
import { SHARED_SECTIONS_COLLECTION, extractSharedSectionRefsFromDocument, getLabelField } from "@/cms/core";

export const prerender = false;

const cmsRuntime = cms as Record<string, any>;

export const GET: APIRoute = async ({ params }) => {
  const { collection: collectionSlug, id: documentId } = params;
  if (!collectionSlug || !documentId) {
    return Response.json({ refs: [] });
  }

  const collection = config.collections.find((c) => c.slug === collectionSlug);
  if (!collection) return Response.json({ refs: [] });

  const refs: Array<{ collection: string; label: string; count: number }> = [];

  if (collectionSlug === SHARED_SECTIONS_COLLECTION) {
    for (const otherCollection of config.collections) {
      if (otherCollection.slug === SHARED_SECTIONS_COLLECTION) continue;
      const hasSharedCapableField = Object.values(otherCollection.fields).some(
        (field: any) => (field.type === "blocks" && field.shared !== false) || field.type === "content",
      );
      if (!hasSharedCapableField) continue;

      const otherApi = cmsRuntime[otherCollection.slug];
      if (!otherApi) continue;

      try {
        const allDocs = await otherApi.find({ status: "any", limit: 500 });
        const count = allDocs.filter((doc: Record<string, unknown>) =>
          extractSharedSectionRefsFromDocument(otherCollection, doc).includes(documentId),
        ).length;

        if (count > 0) {
          refs.push({
            collection: otherCollection.labels.plural,
            label: getLabelField(otherCollection),
            count,
          });
        }
      } catch {}
    }

    return Response.json({ refs, total: refs.reduce((sum, r) => sum + r.count, 0) });
  }

  for (const otherCollection of config.collections) {
    if (otherCollection.slug === collectionSlug) continue;
    const relationFields = Object.entries(otherCollection.fields).filter(
      ([, f]) => f.type === "relation" && (f as any).collection === collectionSlug,
    );
    if (relationFields.length === 0) continue;

    const otherApi = cmsRuntime[otherCollection.slug];
    if (!otherApi) continue;

    for (const [fieldName, field] of relationFields) {
      try {
        const isMany = (field as any).hasMany;
        let count = 0;

        if (isMany) {
          const allDocs = await otherApi.find({ status: "any", limit: 200 });
          count = allDocs.filter((r: Record<string, unknown>) => {
            const val = r[fieldName];
            if (Array.isArray(val)) return val.includes(documentId);
            if (typeof val === "string") return val.includes(documentId);
            return false;
          }).length;
        } else {
          count = await otherApi.count({ status: "any", where: { [fieldName]: documentId } });
        }

        if (count > 0) {
          refs.push({
            collection: otherCollection.labels.plural,
            label: getLabelField(otherCollection),
            count,
          });
        }
      } catch {}
    }
  }

  return Response.json({ refs, total: refs.reduce((sum, r) => sum + r.count, 0) });
};
