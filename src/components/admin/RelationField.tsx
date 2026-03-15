"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, Search, X } from "lucide-react";

import { Button } from "@/components/admin/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/admin/ui/sheet";

type Option = { value: string; label: string };

type Props = {
  name: string;
  value?: string;
  hasMany?: boolean;
  options: Option[];
  collectionSlug: string;
  collectionLabel: string;
};

export default function RelationField({
  name,
  value: initialValue,
  hasMany = false,
  options: initialOptions,
  collectionSlug,
  collectionLabel,
}: Props) {
  const [options, setOptions] = useState(initialOptions);
  const [selected, setSelected] = useState<string[]>(() => {
    if (!initialValue) return [];
    if (hasMany) {
      try {
        const parsed = JSON.parse(initialValue);
        return Array.isArray(parsed) ? parsed.map(String) : [];
      } catch {
        return [];
      }
    }
    return initialValue ? [initialValue] : [];
  });
  const [search, setSearch] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const hiddenValue = hasMany ? JSON.stringify(selected) : (selected[0] ?? "");

  const getLabel = useCallback((id: string) => options.find((o) => o.value === id)?.label ?? id, [options]);

  const filteredOptions = options.filter((o) => {
    if (selected.includes(o.value) && hasMany) return false;
    return o.label.toLowerCase().includes(search.toLowerCase());
  });

  const selectItem = (id: string) => {
    if (hasMany) {
      setSelected((prev) => (prev.includes(id) ? prev : [...prev, id]));
    } else {
      setSelected([id]);
    }
    setSearch("");
  };

  const remove = (id: string) => {
    setSelected((prev) => prev.filter((v) => v !== id));
  };

  // Listen for postMessage from embedded iframe after successful save
  useEffect(() => {
    if (!sheetOpen) return;

    const handleMessage = (e: MessageEvent) => {
      if (e.data?.type !== "cms:created") return;
      const docId = String(e.data.id);
      fetch(`/api/cms/${collectionSlug}/${docId}?status=any`)
        .then((res) => (res.ok ? res.json() : null))
        .then((doc) => {
          if (doc) {
            const label = String(doc.title ?? doc.name ?? doc.slug ?? docId);
            setOptions((prev) => {
              const exists = prev.some((o) => o.value === docId);
              return exists
                ? prev.map((o) => (o.value === docId ? { ...o, label } : o))
                : [{ value: docId, label }, ...prev];
            });
            selectItem(docId);
          }
          setSheetOpen(false);
        });
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [sheetOpen, collectionSlug]);

  return (
    <div className="space-y-2">
      <input type="hidden" name={name} value={hiddenValue} />

      {/* Selected items */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((id) => (
            <span
              key={id}
              className="bg-secondary text-secondary-foreground inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-sm"
            >
              {getLabel(id)}
              <button
                type="button"
                onClick={() => remove(id)}
                className="text-muted-foreground hover:text-foreground -mr-0.5 rounded p-0.5"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Search + select */}
      {(hasMany || selected.length === 0) && (
        <div className="relative">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${collectionLabel.toLowerCase()}...`}
            className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex h-9 w-full rounded-md border py-1 pr-3 pl-8 text-sm shadow-sm transition-colors focus-visible:ring-1 focus-visible:outline-none"
          />
          {search && (
            <div className="border-border bg-popover absolute top-full z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-md border shadow-md">
              {filteredOptions.length > 0 ? (
                filteredOptions.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => selectItem(o.value)}
                    className="hover:bg-accent w-full px-3 py-1.5 text-left text-sm"
                  >
                    {o.label}
                  </button>
                ))
              ) : (
                <div className="text-muted-foreground px-3 py-2 text-sm">No results</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Create new button */}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="text-muted-foreground"
        onClick={() => setSheetOpen(true)}
      >
        <Plus className="size-3.5" />
        Create {collectionLabel.toLowerCase()}
      </Button>

      {/* Create sheet — full-width iframe with the actual add-new page */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="data-[side=right]:w-[80vw] data-[side=right]:sm:max-w-[80vw]">
          <SheetHeader>
            <SheetTitle>Create {collectionLabel.toLowerCase()}</SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-hidden px-4 pb-4">
            {sheetOpen && (
              <iframe
                ref={iframeRef}
                src={`/admin/${collectionSlug}/new?_embed=1`}
                className="size-full rounded-md border"
              />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
