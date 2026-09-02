import * as React from "react";

/**
 * Debounced document lookup against /api/cms/admin/search, shared by the
 * command palette, relation comboboxes and internal-link pickers so they all
 * behave the same: nothing is preloaded, two characters start a search, and a
 * picker opened without a query shows the most recently updated documents.
 */
export type DocumentHit = {
  collection: string;
  collectionLabel: string;
  docId: string;
  title: string;
  editUrl: string;
  href: string | null;
  status: string | null;
};

export const MIN_QUERY_LENGTH = 2;
export const DEBOUNCE_MS = 200;

type Params = { q?: string; collections?: string[]; ids?: string[]; limit?: number };

const searchUrl = ({ q, collections, ids, limit }: Params) => {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (collections?.length) params.set("collection", collections.join(","));
  if (ids?.length) params.set("ids", ids.join(","));
  if (limit) params.set("limit", String(limit));
  return `/api/cms/admin/search?${params.toString()}`;
};

export type DocumentPage = { hits: DocumentHit[]; hasMore: boolean };

export async function fetchDocumentPage(params: Params, signal?: AbortSignal): Promise<DocumentPage> {
  const res = await fetch(searchUrl(params), { signal, credentials: "same-origin" });
  if (!res.ok) return { hits: [], hasMore: false };
  const data = (await res.json()) as { results?: DocumentHit[]; hasMore?: boolean };
  return { hits: Array.isArray(data.results) ? data.results : [], hasMore: data.hasMore === true };
}

export async function fetchDocuments(params: Params, signal?: AbortSignal): Promise<DocumentHit[]> {
  return (await fetchDocumentPage(params, signal)).hits;
}

type Options = {
  /** Target collections. Omit for the palette (every collection). */
  collections?: string[];
  limit?: number;
  /** Fetch the most recent documents when the query is empty (pickers). Off for the palette. */
  recentWhenEmpty?: boolean;
  /** Only fetch while true, e.g. while the popover is open. */
  enabled?: boolean;
};

export function useDocumentSearch({ collections, limit, recentWhenEmpty = false, enabled = true }: Options = {}) {
  const [query, setQueryState] = React.useState("");
  // Last completed fetch, tagged with the request it answers — `loading` is
  // derived from the tag mismatch so it's true from the first keystroke.
  const [fetched, setFetched] = React.useState<({ key: string } & DocumentPage) | null>(null);

  const trimmed = query.trim();
  const tooShort = trimmed.length > 0 && trimmed.length < MIN_QUERY_LENGTH;
  const shouldFetch = enabled && (trimmed.length >= MIN_QUERY_LENGTH || (recentWhenEmpty && trimmed.length === 0));
  const fetchKey = JSON.stringify([trimmed, collections ?? [], limit ?? null]);

  // Clearing happens in the event handler, never synchronously inside the
  // effect, so a keystroke that drops below the minimum drops stale results.
  const setQuery = React.useCallback(
    (next: string) => {
      setQueryState(next);
      const t = next.trim();
      if (t.length < MIN_QUERY_LENGTH && !(recentWhenEmpty && t.length === 0)) setFetched(null);
    },
    [recentWhenEmpty],
  );

  React.useEffect(() => {
    if (!shouldFetch) return;
    const controller = new AbortController();
    const timer = setTimeout(
      async () => {
        try {
          const page = await fetchDocumentPage({ q: trimmed, collections, limit }, controller.signal);
          setFetched({ key: fetchKey, ...page });
        } catch (err) {
          if ((err as { name?: string })?.name !== "AbortError")
            setFetched({ key: fetchKey, hits: [], hasMore: false });
        }
      },
      trimmed ? DEBOUNCE_MS : 0,
    );
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
    // `fetchKey` encodes trimmed + collections identity + limit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchKey, shouldFetch]);

  const reset = React.useCallback(() => {
    setQueryState("");
    setFetched(null);
  }, []);

  return {
    query,
    setQuery,
    results: fetched?.hits ?? [],
    /** The server cut the list at `limit` — more documents match than are shown. */
    hasMore: fetched?.hasMore ?? false,
    loading: shouldFetch && fetched?.key !== fetchKey,
    tooShort,
    reset,
  };
}
