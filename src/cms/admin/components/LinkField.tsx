"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import InternalLinkPicker, { type LinkOptionGroup } from "./InternalLinkPicker";

// A structured link control: URL + label + open-in-new-tab, stored as
// { type, url, label, newTab }. A leading "/" is treated as an internal link.
// When linkOptions are provided, internal links are chosen with a document
// picker instead of a hand-typed path (which silently breaks on slug edits).
type LinkValue = { type?: string; url?: string; label?: string; newTab?: boolean };

type Props = {
  name?: string;
  value?: string | LinkValue;
  onChange?: (value: LinkValue) => void;
  linkOptions?: LinkOptionGroup[];
};

function parse(v: unknown): LinkValue {
  if (!v) return {};
  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return {};
    try {
      return JSON.parse(s) as LinkValue;
    } catch {
      return { url: s };
    }
  }
  return v as LinkValue;
}

export default function LinkField({ name, value: initial, onChange, linkOptions = [] }: Props) {
  const [value, setValue] = useState<LinkValue>(parse(initial));
  const [linkType, setLinkType] = useState<"internal" | "external">(() => {
    const url = parse(initial).url ?? "";
    if (url) return url.startsWith("/") ? "internal" : "external";
    return linkOptions.length > 0 ? "internal" : "external";
  });
  const hiddenRef = useRef<HTMLInputElement>(null);
  const isInitial = useRef(true);

  useEffect(() => {
    if (isInitial.current) {
      isInitial.current = false;
      return;
    }
    hiddenRef.current?.dispatchEvent(new Event("change", { bubbles: true }));
  }, [value]);

  const set = (patch: Partial<LinkValue>) => {
    const next: LinkValue = { ...value, ...patch };
    if (next.url) next.type = next.url.startsWith("/") ? "internal" : "external";
    setValue(next);
    onChange?.(next);
  };

  const hasPicker = linkOptions.length > 0;

  return (
    <div className="space-y-2 rounded-md border p-3">
      {name && <input type="hidden" name={name} value={value.url ? JSON.stringify(value) : ""} ref={hiddenRef} />}
      <div className="grid gap-1">
        <Label className="text-xs">{hasPicker ? "Link" : "URL"}</Label>
        {hasPicker ? (
          <div className="flex items-center gap-2">
            <Select
              items={[
                { value: "internal", label: "Internal" },
                { value: "external", label: "External" },
              ]}
              value={linkType}
              onValueChange={(v) => setLinkType((v as "internal" | "external") ?? "internal")}
            >
              <SelectTrigger className="w-28 shrink-0 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="internal">Internal</SelectItem>
                  <SelectItem value="external">External</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
            {linkType === "internal" ? (
              <InternalLinkPicker
                editHref={value.url ?? ""}
                linkOptions={linkOptions}
                onSelect={(item) => set({ url: item.href, ...(value.label ? {} : { label: item.label }) })}
              />
            ) : (
              <Input
                value={value.url ?? ""}
                placeholder="https://example.com"
                onChange={(e) => set({ url: e.target.value })}
              />
            )}
          </div>
        ) : (
          <Input
            value={value.url ?? ""}
            placeholder="https://example.com  or  /about"
            onChange={(e) => set({ url: e.target.value })}
          />
        )}
      </div>
      <div className="grid gap-1">
        <Label className="text-xs">Label</Label>
        <Input value={value.label ?? ""} placeholder="Link text" onChange={(e) => set({ label: e.target.value })} />
      </div>
      <label className="text-muted-foreground inline-flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="border-input size-4 rounded"
          checked={!!value.newTab}
          onChange={(e) => set({ newTab: e.target.checked })}
        />
        Open in new tab
        {value.url && <span className="ml-auto text-xs">({value.type})</span>}
      </label>
    </div>
  );
}
