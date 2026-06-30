"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { cn } from "../lib/utils";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger } from "./ui/select";

type ColorOption = { label: string; value: string };

type Props = {
  name?: string;
  value?: string;
  placeholder?: string;
  /** Predefined palette (from `admin.colors` in cms.config.ts). */
  colors?: ColorOption[];
  onChange?: (value: string) => void;
};

function Swatch({ color }: { color: string }) {
  return (
    <span className="size-4 shrink-0 rounded border border-black/10" style={{ backgroundColor: color }} aria-hidden />
  );
}

export default function ColorField({ name, value: initial, placeholder, colors = [], onChange }: Props) {
  const [value, setValue] = useState(initial ?? "");
  const hiddenRef = useRef<HTMLInputElement>(null);
  const isInitial = useRef(true);

  // Mirror SelectField: notify the surrounding form when used as a top-level field.
  useEffect(() => {
    if (isInitial.current) {
      isInitial.current = false;
      return;
    }
    hiddenRef.current?.dispatchEvent(new Event("change", { bubbles: true }));
  }, [value]);

  const set = (v: string) => {
    setValue(v);
    onChange?.(v);
  };

  const selected = colors.find((c) => c.value.toLowerCase() === value.trim().toLowerCase());

  return (
    <div className="relative">
      {name && <input type="hidden" name={name} value={value} ref={hiddenRef} />}

      <Select items={colors} value={value} onValueChange={(v) => set((v as string) ?? "")}>
        <SelectTrigger className={cn("w-full", value && "pr-14")}>
          {selected ? (
            <span className="flex flex-1 items-center gap-2">
              <Swatch color={selected.value} />
              <span>{selected.label}</span>
              <span className="text-muted-foreground ml-auto font-mono text-xs">{selected.value}</span>
            </span>
          ) : (
            <span className="text-muted-foreground flex-1 text-left">{placeholder || "Select a colour…"}</span>
          )}
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {colors.map((c) => (
              <SelectItem key={c.value} value={c.value}>
                <Swatch color={c.value} />
                <span className="flex-1">{c.label}</span>
                <span className="text-muted-foreground font-mono text-xs">{c.value}</span>
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>

      {value && (
        <button
          type="button"
          title="Clear"
          onClick={() => set("")}
          className="text-muted-foreground hover:text-foreground absolute top-1/2 right-8 -translate-y-1/2"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}
