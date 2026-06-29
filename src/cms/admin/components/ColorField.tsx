"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "../lib/utils";
import { Input } from "./ui/input";

// Brand palette offered as one-click swatches. An empty value means "inherit the
// default/brand colour" — editors don't have to type hex codes.
const BRAND_COLORS = [
  "#FFDBEB",
  "#4000FF",
  "#7800F0",
  "#00AA50",
  "#FF3C1B",
  "#FFE300",
  "#00BB5F",
  "#E6E7E8",
  "#000000",
  "#FFFFFF",
];

type Props = {
  name?: string;
  value?: string;
  placeholder?: string;
  onChange?: (value: string) => void;
};

export default function ColorField({ name, value: initial, placeholder, onChange }: Props) {
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

  const isHex = /^#[0-9a-fA-F]{6}$/.test(value);
  const normalized = value.trim().toLowerCase();

  return (
    <div className="space-y-2">
      {name && <input type="hidden" name={name} value={value} ref={hiddenRef} />}

      <div className="flex flex-wrap items-center gap-1.5">
        {BRAND_COLORS.map((c) => {
          const selected = normalized === c.toLowerCase();
          return (
            <button
              key={c}
              type="button"
              title={c}
              onClick={() => set(selected ? "" : c)}
              className={cn(
                "size-6 rounded-full border border-black/10 transition",
                selected ? "ring-ring ring-2 ring-offset-2" : "hover:scale-110",
              )}
              style={{ backgroundColor: c }}
            />
          );
        })}

        <label
          className="border-input text-muted-foreground hover:text-foreground relative ml-1 inline-flex size-6 cursor-pointer items-center justify-center rounded-full border border-dashed text-sm leading-none"
          title="Custom colour"
        >
          +
          <input
            type="color"
            value={isHex ? value : "#000000"}
            onChange={(e) => set(e.target.value)}
            className="absolute inset-0 cursor-pointer opacity-0"
          />
        </label>
      </div>

      <div className="flex items-center gap-2">
        <span
          className="size-5 shrink-0 rounded border border-black/10"
          style={{ backgroundColor: isHex ? value : "transparent" }}
        />
        <Input
          value={value}
          placeholder={placeholder ?? "Inherit (default)"}
          onChange={(e) => set(e.target.value)}
          className="h-8 max-w-[150px] font-mono text-sm"
        />
        {value && (
          <button type="button" onClick={() => set("")} className="text-muted-foreground hover:text-foreground text-xs">
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
