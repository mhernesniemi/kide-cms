"use client";

import * as React from "react";

import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "./ui/command";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";

type Result = {
  collection: string;
  collectionLabel: string;
  docId: string;
  title: string;
  editUrl: string;
  status: string | null;
};

const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 150;

export default function CommandPalette() {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<Result[]>([]);
  const [loading, setLoading] = React.useState(false);
  // Controlled cmdk selection so we can force "highlight first item" every time the result
  // set changes — cmdk would otherwise hold onto the previous highlight even when that item
  // is no longer in the list (especially with shouldFilter={false}).
  const [selected, setSelected] = React.useState("");

  const itemValue = (r: Result) => `${r.collection}:${r.docId}`;

  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  const handleOpenChange = React.useCallback((next: boolean) => {
    setOpen(next);
    if (!next) {
      setQuery("");
      setResults([]);
      setLoading(false);
      setSelected("");
    }
  }, []);

  const handleQueryChange = React.useCallback((next: string) => {
    setQuery(next);
    if (next.trim().length < MIN_QUERY_LENGTH) {
      setResults([]);
      setLoading(false);
      setSelected("");
    } else {
      setLoading(true);
    }
  }, []);

  React.useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) return;

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/cms/admin/search?q=${encodeURIComponent(trimmed)}`, {
          signal: controller.signal,
          credentials: "same-origin",
        });
        if (!res.ok) {
          setResults([]);
          setLoading(false);
          return;
        }
        const data = (await res.json()) as { results?: Result[] };
        const next = Array.isArray(data.results) ? data.results : [];
        setResults(next);
        setSelected(next.length > 0 ? itemValue(next[0]) : "");
        setLoading(false);
      } catch (err) {
        if ((err as { name?: string })?.name !== "AbortError") {
          setResults([]);
          setLoading(false);
        }
      }
    }, DEBOUNCE_MS);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query]);

  const grouped = React.useMemo(() => {
    const groups = new Map<string, { label: string; items: Result[] }>();
    for (const r of results) {
      let g = groups.get(r.collection);
      if (!g) {
        g = { label: r.collectionLabel, items: [] };
        groups.set(r.collection, g);
      }
      g.items.push(r);
    }
    return Array.from(groups.entries()).map(([collection, { label, items }]) => ({ collection, label, items }));
  }, [results]);

  const trimmed = query.trim();
  const showHint = trimmed.length < MIN_QUERY_LENGTH;
  // Only show the loading state when there are no previous results to display —
  // otherwise keep the stale list visible to avoid a jarring empty-then-fill flash.
  const showLoading = !showHint && loading && results.length === 0;
  const showEmpty = !showHint && !loading && results.length === 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="top-[18vh] max-w-xl translate-y-0 gap-0 overflow-hidden p-0">
        <DialogTitle className="sr-only">Search content</DialogTitle>
        <DialogDescription className="sr-only">
          Search content collections by title and open the edit view.
        </DialogDescription>
        <Command shouldFilter={false} value={selected} onValueChange={setSelected}>
          <CommandInput value={query} onValueChange={handleQueryChange} placeholder="Search content…" autoFocus />
          <CommandList className="max-h-[60vh]">
            {showHint && (
              <div className="text-muted-foreground py-6 text-center text-sm">
                Type at least {MIN_QUERY_LENGTH} characters to search.
              </div>
            )}
            {showLoading && <div className="text-muted-foreground py-6 text-center text-sm">Searching…</div>}
            {showEmpty && <CommandEmpty>No results.</CommandEmpty>}
            {grouped.map((group) => (
              <CommandGroup key={group.collection} heading={group.label}>
                {group.items.map((item) => (
                  <CommandItem
                    key={itemValue(item)}
                    value={itemValue(item)}
                    onSelect={() => {
                      window.location.href = item.editUrl;
                      setOpen(false);
                    }}
                    className="px-3"
                  >
                    <span className="flex-1 truncate">{item.title}</span>
                    {item.status && item.status !== "published" && (
                      <span className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 text-[10px] tracking-wide uppercase">
                        {item.status}
                      </span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
