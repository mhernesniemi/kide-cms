import type { APIRoute } from "astro";

import { cms } from "virtual:kide/api";
import config from "virtual:kide/config";
import { getLabelField } from "../../../core";

export const prerender = false;

/**
 * Document lookup for the admin. Serves three callers with one shape:
 *
 *   ?q=term                          command palette — every collection, a few hits each
 *   ?q=term&collection=a,b&limit=20  relation / internal-link pickers — the target collections only
 *   ?collection=a&ids=x,y            label resolution for already-selected values
 *   ?collection=a                    no query yet — the most recently updated documents
 *
 * Every read goes through `find()` with the caller's user, so collection and
 * per-document access rules apply exactly as in the admin lists.
 */
const HIDDEN_FROM_SEARCH = new Set(["form-submissions"]);
const MIN_QUERY_LENGTH = 2;
const PALETTE_PER_COLLECTION = 5;
const PALETTE_TOTAL_CAP = 30;
const PICKER_DEFAULT_LIMIT = 20;
const PICKER_MAX_LIMIT = 50;
const MAX_IDS = 200;

export type SearchResult = {
  collection: string;
  collectionLabel: string;
  docId: string;
  title: string;
  editUrl: string;
  /** Public route of the document (internal-link pickers store this). */
  href: string | null;
  status: string | null;
};

type CollectionLike = { slug: string; singleton?: boolean; labels: { singular: string; plural: string } };

const csv = (value: string | null) =>
  (value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

export const GET: APIRoute = async ({ url, locals }) => {
  if (!locals.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cmsAny = cms as Record<string, any>;
  const context = { user: locals.user };
  const q = (url.searchParams.get("q") ?? "").trim();
  const requested = csv(url.searchParams.get("collection"));
  const ids = csv(url.searchParams.get("ids")).slice(0, MAX_IDS);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || PICKER_DEFAULT_LIMIT, 1), PICKER_MAX_LIMIT);

  const toResult = (collection: CollectionLike, doc: Record<string, unknown>): SearchResult => ({
    collection: collection.slug,
    collectionLabel: collection.singleton ? "Single" : collection.labels.singular,
    docId: String(doc._id),
    title: collection.singleton
      ? collection.labels.singular
      : String(doc[getLabelField(collection as any)] ?? doc.slug ?? doc._id),
    editUrl: `/admin/${collection.slug}/${doc._id}`,
    href: cmsAny.meta?.getRouteForDocument?.(collection.slug, doc) ?? null,
    status: typeof doc._status === "string" ? doc._status : null,
  });

  // Picker mode: explicit target collections.
  if (requested.length > 0) {
    const collections = (config.collections as CollectionLike[]).filter(
      (c) => requested.includes(c.slug) && !HIDDEN_FROM_SEARCH.has(c.slug),
    );
    const results: SearchResult[] = [];
    // Pickers say so when the list is cut off, so 20 rows don't read as "all
    // there is" — one extra row tells us without a count query.
    let hasMore = false;

    for (const collection of collections) {
      const api = cmsAny[collection.slug];
      if (!api?.find) continue;

      // access denied or runtime error — skip this collection silently, like the palette
      const docs: Array<Record<string, unknown>> | null = await (async () => {
        if (ids.length > 0) {
          const found = await Promise.all(
            ids.map((id) =>
              api.find({ where: { _id: id }, status: "any", limit: 1 }, context).then((d: any[]) => d[0]),
            ),
          );
          return found.filter(Boolean);
        }
        // Recently-updated first in both modes — without a sort, LIMIT keeps an
        // arbitrary subset of the matches.
        const sort = { field: "_updatedAt", direction: "desc" } as const;
        const probe = limit + 1;
        const found =
          q.length >= MIN_QUERY_LENGTH
            ? await api.find({ search: q, status: "any", sort, limit: probe }, context)
            : await api.find({ status: "any", sort, limit: probe }, context);
        if (found.length > limit) hasMore = true;
        return found.slice(0, limit);
      })().catch(() => null);

      if (!docs) continue;
      for (const doc of docs) results.push(toResult(collection, doc));
    }

    return Response.json({ results, hasMore });
  }

  // Palette mode: everything, a few hits per collection.
  if (q.length < MIN_QUERY_LENGTH) return Response.json({ results: [] });

  const results: SearchResult[] = [];
  const qLower = q.toLowerCase();

  for (const collection of config.collections as CollectionLike[]) {
    if (HIDDEN_FROM_SEARCH.has(collection.slug)) continue;
    const api = cmsAny[collection.slug];
    if (!api?.find) continue;

    // Singletons: there's exactly one doc, so we don't run a body search — instead match
    // on the collection's singular label (which is what gets shown to admins). Body-search
    // would fight UX: e.g. searching "front" for the "Front page" singleton must find it
    // even if the singleton's body text says nothing about "front".
    const docs: Array<Record<string, unknown>> | null = collection.singleton
      ? collection.labels.singular.toLowerCase().includes(qLower)
        ? await api.find({ status: "any", limit: 1 }, context).catch(() => null)
        : []
      : await api
          .find(
            {
              search: q,
              status: "any",
              sort: { field: "_updatedAt", direction: "desc" },
              limit: PALETTE_PER_COLLECTION,
            },
            context,
          )
          .catch(() => null);

    if (!docs) continue;
    for (const doc of docs) {
      results.push(toResult(collection, doc));
      if (results.length >= PALETTE_TOTAL_CAP) break;
    }
    if (results.length >= PALETTE_TOTAL_CAP) break;
  }

  return Response.json({ results });
};
