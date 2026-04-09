import type { APIRoute } from "astro";
import config from "virtual:kide/config";
import { cms } from "virtual:kide/api";
import { getLabelField } from "@kidecms/core";

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
