"use client";

import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "./ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "./ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { cn } from "../lib/utils";
import { MIN_QUERY_LENGTH, fetchDocuments, useDocumentSearch, type DocumentHit } from "../lib/use-document-search";

/**
 * The one document-picking combobox: trigger button, popover, server-backed
 * search with recent documents while the query is empty. Every relation-style
 * picker in the admin (top-level relation fields, relation sub-fields inside
 * blocks, internal-link pickers) renders this and differs only in how it
 * stores the pick.
 */
export default function DocumentCombobox({
  collections,
  groups,
  placeholder,
  display,
  isSelected,
  onPick,
  closeOnPick = false,
  dimUnselected = false,
  limit = 20,
  size,
  triggerId,
  triggerClassName,
}: {
  /** Collection slugs to search. */
  collections: string[];
  /** When set, results render grouped by collection under these labels. */
  groups?: Array<{ collection: string; label: string }>;
  placeholder: string;
  /** Trigger text; empty renders the placeholder muted. */
  display: string;
  isSelected: (hit: DocumentHit) => boolean;
  onPick: (hit: DocumentHit) => void;
  /** Close the popover after a pick (single-select behavior). */
  closeOnPick?: boolean;
  /** Dim unselected rows, e.g. when a hasMany field is at maxItems. */
  dimUnselected?: boolean;
  limit?: number;
  size?: React.ComponentProps<typeof Button>["size"];
  triggerId?: string;
  triggerClassName?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const { query, setQuery, results, hasMore, loading, tooShort, reset } = useDocumentSearch({
    collections,
    limit,
    recentWhenEmpty: true,
    enabled: open,
  });

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) reset();
  };

  const pick = (hit: DocumentHit) => {
    onPick(hit);
    if (closeOnPick) handleOpenChange(false);
  };

  const grouped = React.useMemo(() => {
    if (!groups) return null;
    const byCollection = new Map<string, DocumentHit[]>();
    for (const hit of results) byCollection.set(hit.collection, [...(byCollection.get(hit.collection) ?? []), hit]);
    return groups
      .filter((group) => byCollection.has(group.collection))
      .map((group) => ({ ...group, items: byCollection.get(group.collection)! }));
  }, [groups, results]);

  const renderHit = (hit: DocumentHit) => (
    <CommandItem
      key={hit.docId}
      value={`${hit.collection}:${hit.docId}`}
      onSelect={() => pick(hit)}
      className={cn("px-1", dimUnselected && !isSelected(hit) && "opacity-40")}
    >
      <Check className={cn("size-4", isSelected(hit) ? "opacity-100" : "opacity-0")} />
      <span className="flex-1 truncate">{hit.title}</span>
      {hit.status && hit.status !== "published" && (
        <span className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 text-[10px] tracking-wide uppercase">
          {hit.status}
        </span>
      )}
    </CommandItem>
  );

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          id={triggerId}
          variant="input"
          role="combobox"
          aria-expanded={open}
          size={size}
          className={cn("w-full justify-between text-sm font-normal", triggerClassName)}
        >
          <span className={cn("truncate", !display && "text-muted-foreground")}>{display || placeholder}</span>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput value={query} onValueChange={setQuery} placeholder={placeholder} />
          <CommandList>
            {tooShort && (
              <div className="text-muted-foreground py-6 text-center text-sm">
                Type at least {MIN_QUERY_LENGTH} characters to search.
              </div>
            )}
            {loading && results.length === 0 && (
              <div className="text-muted-foreground py-6 text-center text-sm">Searching…</div>
            )}
            {!loading && !tooShort && results.length === 0 && <CommandEmpty>No documents found.</CommandEmpty>}
            {grouped
              ? grouped.map((group) => (
                  <CommandGroup key={group.collection} heading={group.label}>
                    {group.items.map(renderHit)}
                  </CommandGroup>
                ))
              : results.map(renderHit)}
            {hasMore && results.length > 0 && (
              <div className="text-muted-foreground bg-popover sticky bottom-0 border-t px-3 py-1.5 text-xs">
                {query.trim()
                  ? `Showing the first ${results.length} matches. Refine your search to see others.`
                  : `Showing the ${results.length} most recent. Type to search all.`}
              </div>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/**
 * id → label bookkeeping for relation pickers: seeded from the server-rendered
 * page when possible, resolved through the search API once on mount for
 * anything missing (e.g. values inside blocks), and extended as hits are
 * picked.
 */
export function useRelationLabels(
  collectionSlug: string,
  initialSelected: string[],
  seed: Array<{ value: string; label: string }> = [],
) {
  const [labels, setLabels] = React.useState<Record<string, string>>(() =>
    Object.fromEntries(seed.map((option) => [option.value, option.label])),
  );

  const remember = React.useCallback((hits: Array<{ docId: string; title: string }>) => {
    if (hits.length === 0) return;
    setLabels((prev) => ({ ...prev, ...Object.fromEntries(hits.map((hit) => [hit.docId, hit.title])) }));
  }, []);

  // Only the initial selection needs resolving; later picks arrive with their label.
  React.useEffect(() => {
    const missing = initialSelected.filter((id) => !(id in labels));
    if (missing.length === 0 || !collectionSlug) return;
    const controller = new AbortController();
    fetchDocuments({ collections: [collectionSlug], ids: missing }, controller.signal)
      .then(remember)
      .catch(() => {});
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getLabel = React.useCallback((id: string): string | undefined => labels[id], [labels]);

  return { getLabel, remember };
}
