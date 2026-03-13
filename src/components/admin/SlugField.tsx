"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type Props = {
  name: string;
  value?: string;
  from?: string;
  readOnly?: boolean;
  required?: boolean;
  placeholder?: string;
  className?: string;
};

function slugify(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export default function SlugField({
  name,
  value: initialValue = "",
  from,
  readOnly,
  required,
  placeholder,
  className,
}: Props) {
  const [value, setValue] = React.useState(initialValue);
  const autoSyncRef = React.useRef(!initialValue);
  const wrapperRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!from || readOnly) return;

    const form = wrapperRef.current?.closest("form");
    if (!form) return;

    const sourceInput = form.querySelector<HTMLInputElement>(`[name="${from}"]`);
    if (!sourceInput) return;

    const handleInput = () => {
      if (autoSyncRef.current) {
        setValue(slugify(sourceInput.value));
      }
    };

    sourceInput.addEventListener("input", handleInput);
    return () => sourceInput.removeEventListener("input", handleInput);
  }, [from, readOnly]);

  return (
    <div ref={wrapperRef}>
      <input
        type="text"
        id={name}
        name={name}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          autoSyncRef.current = false;
        }}
        placeholder={placeholder}
        readOnly={readOnly}
        required={required}
        className={cn(
          "border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 bg-muted/30 h-9 w-full min-w-0 rounded-lg border px-3 py-1.5 text-base transition-colors outline-none focus-visible:ring-3 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
      />
    </div>
  );
}
