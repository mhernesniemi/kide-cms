"use client";

import { useEffect, useRef, useState } from "react";
import { Checkbox } from "./ui/checkbox";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import InternalLinkPicker, { type LinkableCollection } from "./InternalLinkPicker";

// A structured link control: URL + label + open-in-new-tab, stored as
// { type, url, label, title, newTab, docId, collection }. `type` is the editor
// mode the value was authored in and is stored, never re-guessed from the URL:
// "reference" is a document picked from a linkable collection (docId +
// collection, so renderers resolve the current route via resolveLinkUrl() and
// the link survives slug edits, with `url` kept as a cached fallback), "custom"
// is a hand-written URL — a site path or an absolute URL, both fine. `title` is
// the picked document's title — renderers use it as the link text when `label`
// is left empty.
type LinkValue = {
  type?: string;
  url?: string;
  label?: string;
  title?: string;
  newTab?: boolean;
  docId?: string;
  collection?: string;
};

type LinkMode = "reference" | "custom";

/** Legacy values (and seeds) predate the stored mode: a document reference is
 * one that actually carries a document, everything else is a custom URL. */
function modeOf(value: LinkValue, hasPicker: boolean): LinkMode {
  if (value.type === "reference" || value.type === "custom") return value.type;
  if (value.docId && value.collection) return "reference";
  if (value.url) return "custom";
  return hasPicker ? "reference" : "custom";
}

type Props = {
  name?: string;
  value?: string | LinkValue;
  onChange?: (value: LinkValue) => void;
  linkOptions?: LinkableCollection[];
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
  const hasPicker = linkOptions.length > 0;
  const [value, setValue] = useState<LinkValue>(parse(initial));
  const [mode, setMode] = useState<LinkMode>(() => modeOf(parse(initial), hasPicker));
  const hiddenRef = useRef<HTMLInputElement>(null);
  const isInitial = useRef(true);

  useEffect(() => {
    if (isInitial.current) {
      isInitial.current = false;
      return;
    }
    hiddenRef.current?.dispatchEvent(new Event("change", { bubbles: true }));
  }, [value]);

  const set = (patch: Partial<LinkValue>, nextMode: LinkMode = mode) => {
    const next: LinkValue = { ...value, ...patch, type: nextMode };
    setValue(next);
    onChange?.(next);
  };

  // Switching modes drops what the other mode owns: a custom URL keeps its text
  // as a starting point, a document pick starts from an empty picker.
  const changeMode = (next: LinkMode) => {
    setMode(next);
    if (next === "custom") set({ title: undefined, docId: undefined, collection: undefined }, next);
    else set({ url: "", title: undefined, docId: undefined, collection: undefined }, next);
  };

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
                  { value: "reference", label: "Choose page" },
                  { value: "custom", label: "Type URL" },
                ]}
                value={mode}
                onValueChange={(v) => changeMode((v as LinkMode) ?? "reference")}
              >
                <SelectTrigger className="w-36 shrink-0 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="reference">Choose page</SelectItem>
                    <SelectItem value="custom">Type URL</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
              {mode === "reference" ? (
                <InternalLinkPicker
                  editHref={value.url ?? ""}
                  editTitle={value.title}
                  collections={linkOptions}
                  onSelect={(item) =>
                    set({ url: item.href, title: item.label, docId: item.id, collection: item.collection })
                  }
                />
              ) : (
                <Input
                  value={value.url ?? ""}
                  placeholder="https://example.com  or  /contact"
                  onChange={(e) =>
                    set({ url: e.target.value, title: undefined, docId: undefined, collection: undefined })
                  }
                />
              )}
            </div>
          ) : (
            <Input
              value={value.url ?? ""}
              placeholder="https://example.com  or  /contact"
              onChange={(e) => set({ url: e.target.value, title: undefined, docId: undefined, collection: undefined })}
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
