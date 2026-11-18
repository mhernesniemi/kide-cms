"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { Button } from "./ui/button";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "./ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { cn } from "../lib/utils";

export type TreeSelectItem = {
  value: string;
  label: string;
  depth: number;
  path: string[];
};

type Props = {
  name: string;
  value?: string;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  items: TreeSelectItem[];
  onChange?: (value: string) => void;
  /** Pick several values; the hidden input then carries a JSON string array. */
  multiple?: boolean;
};

export function flattenTree<T extends { children?: T[] }>(
  nodes: T[],
  getValue: (node: T) => string,
  getLabel: (node: T) => string,
  depth = 0,
  path: string[] = [],
): TreeSelectItem[] {
  const result: TreeSelectItem[] = [];
  for (const node of nodes) {
    const currentPath = [...path, getLabel(node)];
    result.push({ value: getValue(node), label: getLabel(node), depth, path: currentPath });
    if (node.children?.length) {
      result.push(...flattenTree(node.children, getValue, getLabel, depth + 1, currentPath));
    }
  }
  return result;
}

export function flattenByParent<T>(
  items: T[],
  getValue: (item: T) => string,
  getLabel: (item: T) => string,
  getParent: (item: T) => string | null,
): TreeSelectItem[] {
  const childrenMap = new Map<string | null, T[]>();
  for (const item of items) {
    const parent = getParent(item);
    if (!childrenMap.has(parent)) childrenMap.set(parent, []);
    childrenMap.get(parent)!.push(item);
  }

  const result: TreeSelectItem[] = [];
  const walk = (parentId: string | null, depth: number, path: string[]) => {
    for (const item of childrenMap.get(parentId) ?? []) {
      const currentPath = [...path, getLabel(item)];
      result.push({ value: getValue(item), label: getLabel(item), depth, path: currentPath });
      walk(getValue(item), depth + 1, currentPath);
    }
  };
  walk(null, 0, []);
  return result;
}

const parseMany = (raw: string | undefined): string[] => {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
};

export default function TreeSelect({
  name,
  value: initialValue,
  placeholder = "Select...",
  searchPlaceholder = "Search...",
  emptyMessage = "No results found.",
  items,
  onChange: onChangeProp,
  multiple = false,
}: Props) {
  const [value, setValue] = useState(multiple ? "" : (initialValue ?? ""));
  const [values, setValues] = useState<string[]>(() => (multiple ? parseMany(initialValue) : []));
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const hiddenRef = useRef<HTMLInputElement>(null);
  const isInitial = useRef(true);
  const hiddenValue = multiple ? JSON.stringify(values) : value;

  useEffect(() => {
    if (isInitial.current) {
      isInitial.current = false;
      return;
    }
    hiddenRef.current?.dispatchEvent(new Event("change", { bubbles: true }));
  }, [hiddenValue]);

  const selected = items.find((i) => i.value === value);
  const isSelected = (v: string) => (multiple ? values.includes(v) : value === v);
  const labelOf = (v: string) => items.find((i) => i.value === v);

  // Filtering is ours, not cmdk's: cmdk reorders the DOM while filtering (and
  // doesn't restore it when the query clears), which would bump the pinned
  // "None" row around — and "None" is a clear-action, not a match for any query.
  const q = query.trim().toLowerCase();
  const filtered = q ? items.filter((item) => item.path.join(" / ").toLowerCase().includes(q)) : items;

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) setQuery("");
  };

  const choose = (next: string) => {
    if (multiple) {
      setValues((current) => (current.includes(next) ? current.filter((v) => v !== next) : [...current, next]));
      return;
    }
    const resolved = next === value ? "" : next;
    setValue(resolved);
    onChangeProp?.(resolved);
    handleOpenChange(false);
  };

  const clear = () => {
    if (multiple) setValues([]);
    else {
      setValue("");
      onChangeProp?.("");
    }
    handleOpenChange(false);
  };

  return (
    <div className="space-y-2">
      <input ref={hiddenRef} type="hidden" name={name} value={hiddenValue} />
      {multiple && values.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {values.map((v) => (
            <span key={v} className="bg-muted inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-sm">
              {labelOf(v)?.label ?? v}
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground"
                aria-label={`Remove ${labelOf(v)?.label ?? v}`}
                onClick={() => setValues((current) => current.filter((x) => x !== v))}
              >
                <X className="size-3.5" />
              </button>
            </span>
          ))}
        </div>
      )}
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <Button
            variant="input"
            role="combobox"
            aria-expanded={open}
            size="lg"
            className="w-full justify-between text-sm font-normal"
          >
            <span className={cn("truncate", (multiple || !selected) && "text-muted-foreground")}>
              {!multiple && selected ? (
                <span className="flex items-center gap-1">
                  {selected.path.length > 1 && (
                    <span className="text-muted-foreground">
                      {selected.path.slice(0, -1).join(" / ")}
                      {" / "}
                    </span>
                  )}
                  {selected.label}
                </span>
              ) : (
                placeholder
              )}
            </span>
            <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput value={query} onValueChange={setQuery} placeholder={searchPlaceholder} />
            <CommandList>
              {filtered.length === 0 && <CommandEmpty>{emptyMessage}</CommandEmpty>}
              {!q && (
                <CommandItem value="__none__" onSelect={clear}>
                  <div className="flex items-center">
                    <Check
                      className={cn(
                        "mr-2 ml-1 size-4 shrink-0",
                        (multiple ? values.length === 0 : !value) ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <span className="text-muted-foreground">None</span>
                  </div>
                </CommandItem>
              )}
              {filtered.map((item) => (
                <CommandItem key={item.value} value={item.path.join(" / ")} onSelect={() => choose(item.value)}>
                  <div className="flex items-center" style={{ paddingLeft: `${item.depth * 1.25}rem` }}>
                    <Check
                      className={cn("mr-2 ml-1 size-4 shrink-0", isSelected(item.value) ? "opacity-100" : "opacity-0")}
                    />
                    {item.label}
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
