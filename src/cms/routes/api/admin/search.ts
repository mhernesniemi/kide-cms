import type { APIRoute } from "astro";

import { cms } from "virtual:kide/api";
import config from "virtual:kide/config";
import { getLabelField } from "@/cms/core";

export const prerender = false;

const HIDDEN_FROM_SEARCH = new Set(["form-submissions"]);
const PER_COLLECTION = 5;
const TOTAL_CAP = 30;

type SearchResult = {
  collection: string;
  collectionLabel: string;
  docId: string;
  title: string;
  editUrl: string;
  status: string | null;
};

export const GET: APIRoute = async ({ url, locals }) => {
  if (!locals.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const q = (url.searchParams.get("q") ?? "").trim();
  if (q.length < 2) return Response.json({ results: [] });

  const cmsAny = cms as Record<string, any>;
  const results: SearchResult[] = [];

  for (const collection of config.collections) {
    if (collection.singleton) continue;
    if (HIDDEN_FROM_SEARCH.has(collection.slug)) continue;

    const api = cmsAny[collection.slug];
    if (!api?.find) continue;

    const docs = await api
      .find({ search: q, status: "any", limit: PER_COLLECTION }, { user: locals.user })
      .catch(() => null as Array<Record<string, unknown>> | null);

    // access denied or runtime error — skip this collection silently
    if (!docs) continue;

    const labelField = getLabelField(collection);
    for (const doc of docs) {
      const title = String(doc[labelField] ?? doc.slug ?? doc._id);
      results.push({
        collection: collection.slug,
        collectionLabel: collection.labels.singular,
        docId: String(doc._id),
        title,
        editUrl: `/admin/${collection.slug}/${doc._id}`,
        status: typeof doc._status === "string" ? doc._status : null,
      });
      if (results.length >= TOTAL_CAP) break;
    }
    if (results.length >= TOTAL_CAP) break;
  }

  return Response.json({ results });
};
