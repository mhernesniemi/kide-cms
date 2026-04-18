"use client";

import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "./ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "./ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { cn } from "../lib/utils";

export type LinkOptionGroup = {
  collection: string;
  label: string;
  items: Array<{ id: string; label: string; href: string }>;
};

export default function InternalLinkPicker({
  editHref,
  linkOptions,
  onSelect,
}: {
  editHref: string;
  linkOptions: LinkOptionGroup[];
  onSelect: (item: { id: string; label: string; href: string }) => void;
}) {
  const [open, setOpen] = React.useState(false);

  const selectedLabel = React.useMemo(() => {
    if (!editHref) return "";
    for (const group of linkOptions) {
      const found = group.items.find((item) => item.href === editHref);
      if (found) return found.label;
    }
    return editHref;
  }, [editHref, linkOptions]);

  return (
    <div className="min-w-0 flex-3">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="h-7 w-full justify-between font-normal"
          >
            <span className={cn("truncate", !selectedLabel && "text-muted-foreground")}>
              {selectedLabel || "Search documents..."}
            </span>
            <ChevronsUpDown className="ml-2 size-3.5 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
          <Command>
            <CommandInput placeholder="Search documents..." />
            <CommandList>
              <CommandEmpty>No documents found.</CommandEmpty>
              {linkOptions.map((group) => (
                <CommandGroup key={group.collection} heading={group.label}>
                  {group.items.map((item) => (
                    <CommandItem
                      key={item.id}
                      value={`${item.label} ${item.href}`}
                      onSelect={() => {
                        onSelect(item);
                        setOpen(false);
                      }}
                    >
                      <Check className={cn("size-4", editHref === item.href ? "opacity-100" : "opacity-0")} />
                      {item.label}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
