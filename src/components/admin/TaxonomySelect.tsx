"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/admin/ui/button";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/admin/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/admin/ui/popover";
import { cn } from "@/lib/utils";

type Props = {
  name: string;
  value?: string;
  taxonomySlug: string;
};

type Term = {
  id: string;
  name: string;
  slug: string;
  children?: Term[];
};

type FlatTerm = {
  slug: string;
  name: string;
  depth: number;
  path: string[];
};

function flattenTerms(terms: Term[], depth = 0, path: string[] = []): FlatTerm[] {
  const result: FlatTerm[] = [];
  for (const term of terms) {
    const currentPath = [...path, term.name];
    result.push({ slug: term.slug, name: term.name, depth, path: currentPath });
    if (term.children?.length) {
      result.push(...flattenTerms(term.children, depth + 1, currentPath));
    }
  }
  return result;
}

export default function TaxonomySelect({ name, value: initialValue, taxonomySlug }: Props) {
  const [value, setValue] = useState(initialValue ?? "");
  const [open, setOpen] = useState(false);
  const [terms, setTerms] = useState<FlatTerm[]>([]);
  const hiddenRef = useRef<HTMLInputElement>(null);
  const isInitial = useRef(true);

  useEffect(() => {
    if (isInitial.current) {
      isInitial.current = false;
      return;
    }
    hiddenRef.current?.dispatchEvent(new Event("change", { bubbles: true }));
  }, [value]);

  useEffect(() => {
    fetch(`/api/cms/taxonomies?where=${encodeURIComponent(JSON.stringify({ slug: taxonomySlug }))}&status=any`)
      .then((res) => (res.ok ? res.json() : { docs: [] }))
      .then((result) => {
        const doc = result.docs?.[0] ?? result[0];
        if (!doc?.terms) return;
        const parsed = typeof doc.terms === "string" ? JSON.parse(doc.terms) : doc.terms;
        if (Array.isArray(parsed)) {
          setTerms(flattenTerms(parsed));
        }
      })
      .catch(() => {});
  }, [taxonomySlug]);

  const selectedTerm = terms.find((t) => t.slug === value);

  return (
    <div className="space-y-2">
      <input ref={hiddenRef} type="hidden" name={name} value={value} />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            size="lg"
            className="border-input bg-muted/30 hover:bg-muted dark:bg-input/30 dark:hover:bg-input/50 w-full justify-between font-normal"
          >
            <span className={cn("truncate", !selectedTerm && "text-muted-foreground")}>
              {selectedTerm ? (
                <span className="flex items-center gap-1">
                  {selectedTerm.path.length > 1 && (
                    <span className="text-muted-foreground">
                      {selectedTerm.path.slice(0, -1).join(" / ")}
                      {" / "}
                    </span>
                  )}
                  {selectedTerm.name}
                </span>
              ) : (
                `Search ${taxonomySlug}...`
              )}
            </span>
            <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
          <Command>
            <CommandInput placeholder="Search terms..." />
            <CommandList>
              <CommandEmpty>No terms found.</CommandEmpty>
              {terms.map((term) => (
                <CommandItem
                  key={term.slug}
                  value={term.path.join(" / ")}
                  onSelect={() => {
                    setValue(term.slug === value ? "" : term.slug);
                    setOpen(false);
                  }}
                >
                  <div className="flex items-center" style={{ paddingLeft: `${term.depth * 1.25}rem` }}>
                    <Check
                      className={cn("mr-2 ml-1 size-4 shrink-0", value === term.slug ? "opacity-100" : "opacity-0")}
                    />
                    {term.name}
                  </div>
                </CommandItem>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
