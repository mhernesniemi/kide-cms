"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/admin/ui/button";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/admin/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/admin/ui/popover";
import { cn } from "@/lib/utils";

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

export default function TreeSelect({
  name,
  value: initialValue,
  placeholder = "Select...",
  searchPlaceholder = "Search...",
  emptyMessage = "No results found.",
  items,
  onChange: onChangeProp,
}: Props) {
  const [value, setValue] = useState(initialValue ?? "");
  const [open, setOpen] = useState(false);
  const hiddenRef = useRef<HTMLInputElement>(null);
  const isInitial = useRef(true);

  useEffect(() => {
    if (isInitial.current) {
      isInitial.current = false;
      return;
    }
    hiddenRef.current?.dispatchEvent(new Event("change", { bubbles: true }));
  }, [value]);

  const selected = items.find((i) => i.value === value);

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
            className="border-input bg-muted/30 hover:bg-muted dark:bg-input/30 dark:hover:bg-input/50 w-full justify-between text-base font-normal"
          >
            <span className={cn("truncate", !selected && "text-muted-foreground")}>
              {selected ? (
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
          <Command>
            <CommandInput placeholder={searchPlaceholder} />
            <CommandList>
              <CommandEmpty>{emptyMessage}</CommandEmpty>
              <CommandItem
                value="__none__"
                onSelect={() => {
                  setValue("");
                  onChangeProp?.("");
                  setOpen(false);
                }}
              >
                <div className="flex items-center">
                  <Check className={cn("mr-2 ml-1 size-4 shrink-0", !value ? "opacity-100" : "opacity-0")} />
                  <span className="text-muted-foreground">None</span>
                </div>
              </CommandItem>
              {items.map((item) => (
                <CommandItem
                  key={item.value}
                  value={item.path.join(" / ")}
                  onSelect={() => {
                    setValue(item.value === value ? "" : item.value);
                    onChangeProp?.(item.value === value ? "" : item.value);
                    setOpen(false);
                  }}
                >
                  <div className="flex items-center" style={{ paddingLeft: `${item.depth * 1.25}rem` }}>
                    <Check
                      className={cn("mr-2 ml-1 size-4 shrink-0", value === item.value ? "opacity-100" : "opacity-0")}
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
