"use client";

import * as React from "react";
import { Input } from "./ui/input";
import { cn } from "../lib/utils";

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
      <Input
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
        className={cn("shadow-none", className)}
      />
    </div>
  );
}
