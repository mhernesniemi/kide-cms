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

  const qLower = q.toLowerCase();

  for (const collection of config.collections) {
    if (HIDDEN_FROM_SEARCH.has(collection.slug)) continue;

    const api = cmsAny[collection.slug];
    if (!api?.find) continue;

    // Singletons: there's exactly one doc, so we don't run a body search — instead match
    // on the collection's singular label (which is what gets shown to admins). Body-search
    // would fight UX: e.g. searching "front" for the "Front page" singleton must find it
    // even if the singleton's body text says nothing about "front".
    if (collection.singleton) {
      if (!collection.labels.singular.toLowerCase().includes(qLower)) continue;
      const docs = await api
        .find({ status: "any", limit: 1 }, { user: locals.user })
        .catch(() => null as Array<Record<string, unknown>> | null);
      if (!docs || docs.length === 0) continue;
      const doc = docs[0];
      results.push({
        collection: collection.slug,
        // Match the sidebar grouping: every singleton lives under one "Singles" header.
        collectionLabel: "Single",
        docId: String(doc._id),
        title: collection.labels.singular,
        editUrl: `/admin/${collection.slug}/${doc._id}`,
        status: typeof doc._status === "string" ? doc._status : null,
      });
      if (results.length >= TOTAL_CAP) break;
      continue;
    }

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
