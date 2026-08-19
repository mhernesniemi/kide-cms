"use client";

import { useEffect, useRef, useState } from "react";
import { Checkbox } from "./ui/checkbox";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import InternalLinkPicker, { type LinkOptionGroup } from "./InternalLinkPicker";

// A structured link control: URL + label + open-in-new-tab, stored as
// { type, url, label, title, newTab }. A leading "/" is treated as an internal
// link. When linkOptions are provided, internal links are chosen with a document
// picker instead of a hand-typed path (which silently breaks on slug edits).
// `title` is the picked document's title — renderers use it as the link text
// when `label` is left empty.
type LinkValue = { type?: string; url?: string; label?: string; title?: string; newTab?: boolean };

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
      <div className="grid gap-2 sm:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="grid gap-1">
          <Label className="text-xs">{hasPicker ? "Link" : "URL"}</Label>
          {hasPicker ? (
            <div className="flex min-w-0 items-center gap-2">
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
                  onSelect={(item) => set({ url: item.href, title: item.label })}
                />
              ) : (
                <Input
                  value={value.url ?? ""}
                  placeholder="https://example.com"
                  onChange={(e) => set({ url: e.target.value, title: undefined })}
                />
              )}
            </div>
          ) : (
            <Input
              value={value.url ?? ""}
              placeholder="https://example.com  or  /about"
              onChange={(e) => set({ url: e.target.value, title: undefined })}
            />
          )}
        </div>
        <div className="grid gap-1">
          <Label className="text-xs">Label</Label>
          <Input
            value={value.label ?? ""}
            placeholder={value.title || "Link text"}
            onChange={(e) => set({ label: e.target.value })}
          />
        </div>
      </div>
      <label className="text-muted-foreground group inline-flex cursor-pointer items-center gap-2 text-sm">
        <Checkbox
          className="group-hover:border-primary/60"
          checked={!!value.newTab}
          onCheckedChange={(checked) => set({ newTab: Boolean(checked) })}
        />
        Open in new tab
      </label>
    </div>
  );
}
