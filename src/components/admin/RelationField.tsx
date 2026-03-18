"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronsUpDown, Plus, X } from "lucide-react";

import { Button } from "@/components/admin/ui/button";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/admin/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/admin/ui/popover";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/admin/ui/sheet";
import { cn } from "@/lib/utils";

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
  const [open, setOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const hiddenRef = useRef<HTMLInputElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const hiddenValue = hasMany ? JSON.stringify(selected) : (selected[0] ?? "");

  // Notify form of changes so UnsavedGuard can detect them
  useEffect(() => {
    hiddenRef.current?.dispatchEvent(new Event("change", { bubbles: true }));
  }, [hiddenValue]);

  const getLabel = useCallback((id: string) => options.find((o) => o.value === id)?.label ?? id, [options]);

  const displayLabel = useMemo(() => {
    if (selected.length === 0) return "";
    if (hasMany) return `${selected.length} selected`;
    return getLabel(selected[0]);
  }, [selected, hasMany, getLabel]);

  const selectItem = (id: string) => {
    if (hasMany) {
      setSelected((prev) => (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]));
    } else {
      setSelected((prev) => (prev[0] === id ? [] : [id]));
      setOpen(false);
    }
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
            if (hasMany) {
              setSelected((prev) => (prev.includes(docId) ? prev : [...prev, docId]));
            } else {
              setSelected([docId]);
            }
          }
          setSheetOpen(false);
        });
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [sheetOpen, collectionSlug, hasMany]);

  return (
    <div className="space-y-2">
      <input ref={hiddenRef} type="hidden" name={name} value={hiddenValue} />

      {/* Selected items (hasMany chips) */}
      {hasMany && selected.length > 0 && (
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

      {/* Combobox */}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            size="lg"
            className="w-full justify-between font-normal"
          >
            <span className={cn("truncate", !displayLabel && "text-muted-foreground")}>
              {displayLabel || `Search ${collectionLabel.toLowerCase()}...`}
            </span>
            <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
          <Command>
            <CommandInput placeholder={`Search ${collectionLabel.toLowerCase()}...`} />
            <CommandList>
              <CommandEmpty>No results found.</CommandEmpty>
              {options.map((o) => (
                <CommandItem key={o.value} value={o.label} onSelect={() => selectItem(o.value)}>
                  <Check className={cn("size-4", selected.includes(o.value) ? "opacity-100" : "opacity-0")} />
                  {o.label}
                </CommandItem>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {/* Create new button */}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="text-foreground/70"
        onClick={() => setSheetOpen(true)}
      >
        <Plus className="size-3.5" />
        Create {collectionLabel.toLowerCase()}
      </Button>

      {/* Create sheet — full-width iframe with the actual add-new page */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent
          side="right"
          className="data-[side=right]:w-[90vw] data-[side=right]:sm:max-w-[90vw] data-[side=right]:lg:w-[50vw] data-[side=right]:lg:max-w-[50vw]"
        >
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
