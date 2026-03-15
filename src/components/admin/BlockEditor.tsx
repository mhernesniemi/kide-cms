"use client";

import { useState, useCallback, useRef } from "react";
import { ChevronRight, Plus, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import { Button } from "@/components/admin/ui/button";
import { Input } from "@/components/admin/ui/input";
import { Label } from "@/components/admin/ui/label";
import { Textarea } from "@/components/admin/ui/textarea";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/admin/ui/collapsible";
import RichTextEditor from "@/components/admin/RichTextEditor";
import ImagePicker from "@/components/admin/ImagePicker";
import SelectField from "@/components/admin/SelectField";

type SubFieldMeta = {
  type: string;
  label?: string;
  required?: boolean;
  options?: string[];
  from?: string;
  admin?: { placeholder?: string; rows?: number; help?: string };
  defaultValue?: unknown;
  of?: { type: string };
};

type BlockTypesMeta = Record<string, Record<string, SubFieldMeta>>;

type Block = {
  _key: string;
  type: string;
  [field: string]: unknown;
};

type Props = {
  name: string;
  value?: string;
  types: BlockTypesMeta;
};

function generateKey() {
  return "blk_" + Math.random().toString(36).slice(2, 9);
}

function humanize(value: string) {
  return value
    .replace(/^_+/, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[-_]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\w/, (char) => char.toUpperCase());
}

function getPreviewText(block: Block, fieldsMeta: Record<string, SubFieldMeta>): string {
  for (const [key, meta] of Object.entries(fieldsMeta)) {
    if (meta.type === "text" && block[key]) {
      const text = String(block[key]);
      return text.length > 60 ? text.slice(0, 60) + "..." : text;
    }
  }
  return "";
}

function parseBlocks(value: string | undefined, types: BlockTypesMeta): Block[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item: Record<string, unknown>) => ({
      ...item,
      _key: generateKey(),
      type: String(item.type ?? Object.keys(types)[0] ?? "unknown"),
    }));
  } catch {
    return [];
  }
}

function serializeBlocks(blocks: Block[]): string {
  return JSON.stringify(blocks.map(({ _key, ...rest }) => rest));
}

export default function BlockEditor({ name, value, types }: Props) {
  const [blocks, setBlocks] = useState<Block[]>(() => parseBlocks(value, types));
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(() => new Set());
  const hiddenRef = useRef<HTMLInputElement>(null);

  const typeNames = Object.keys(types);

  const dispatchChange = useCallback(() => {
    if (hiddenRef.current) {
      hiddenRef.current.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }, []);

  const updateBlocks = useCallback(
    (updater: (prev: Block[]) => Block[]) => {
      setBlocks((prev) => {
        const next = updater(prev);
        // Schedule change event after render
        setTimeout(dispatchChange, 0);
        return next;
      });
    },
    [dispatchChange],
  );

  const addBlock = useCallback(
    (typeName: string) => {
      const fieldsMeta = types[typeName] ?? {};
      const newBlock: Block = { _key: generateKey(), type: typeName };
      for (const [fieldName, meta] of Object.entries(fieldsMeta)) {
        if (meta.defaultValue !== undefined) {
          newBlock[fieldName] = meta.defaultValue;
        } else if (meta.type === "boolean") {
          newBlock[fieldName] = false;
        } else if (meta.type === "array") {
          newBlock[fieldName] = [];
        } else {
          newBlock[fieldName] = "";
        }
      }
      updateBlocks((prev) => [...prev, newBlock]);
      setExpandedKeys((prev) => new Set(prev).add(newBlock._key));
    },
    [types, updateBlocks],
  );

  const removeBlock = useCallback(
    (key: string) => {
      updateBlocks((prev) => prev.filter((b) => b._key !== key));
    },
    [updateBlocks],
  );

  const moveBlock = useCallback(
    (key: string, direction: -1 | 1) => {
      updateBlocks((prev) => {
        const idx = prev.findIndex((b) => b._key === key);
        const targetIdx = idx + direction;
        if (idx < 0 || targetIdx < 0 || targetIdx >= prev.length) return prev;
        const next = [...prev];
        [next[idx], next[targetIdx]] = [next[targetIdx], next[idx]];
        return next;
      });
    },
    [updateBlocks],
  );

  const updateField = useCallback(
    (key: string, fieldName: string, fieldValue: unknown) => {
      updateBlocks((prev) => prev.map((b) => (b._key === key ? { ...b, [fieldName]: fieldValue } : b)));
    },
    [updateBlocks],
  );

  const toggleExpanded = useCallback((key: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const serialized = serializeBlocks(blocks);

  return (
    <div className="space-y-3">
      <input type="hidden" ref={hiddenRef} name={name} value={serialized} />

      {blocks.length === 0 && (
        <div className="bg-muted/20 flex h-20 items-center justify-center rounded-lg border border-dashed">
          <p className="text-muted-foreground text-sm">No blocks added yet</p>
        </div>
      )}

      {blocks.map((block, index) => {
        const fieldsMeta = types[block.type] ?? {};
        const isExpanded = expandedKeys.has(block._key);
        const preview = getPreviewText(block, fieldsMeta);

        return (
          <Collapsible key={block._key} open={isExpanded}>
            <div className="rounded-lg border">
              {/* Header */}
              <div className="flex items-center gap-2 px-3 py-2">
                <CollapsibleTrigger
                  className="hover:bg-accent -ml-1 rounded p-1 transition-colors"
                  onClick={() => toggleExpanded(block._key)}
                >
                  <ChevronRight
                    className={`text-muted-foreground size-4 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                  />
                </CollapsibleTrigger>

                <span className="bg-secondary text-secondary-foreground rounded px-2 py-0.5 text-xs font-medium">
                  {humanize(block.type)}
                </span>

                {!isExpanded && preview && <span className="text-muted-foreground truncate text-sm">{preview}</span>}

                <div className="ml-auto flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    disabled={index === 0}
                    onClick={() => moveBlock(block._key, -1)}
                  >
                    <ArrowUp className="size-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    disabled={index === blocks.length - 1}
                    onClick={() => moveBlock(block._key, 1)}
                  >
                    <ArrowDown className="size-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:text-destructive size-7"
                    onClick={() => removeBlock(block._key)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>

              {/* Content */}
              <CollapsibleContent>
                <div className="space-y-4 border-t px-4 py-4">
                  {Object.entries(fieldsMeta).map(([fieldName, meta]) => (
                    <SubField
                      key={fieldName}
                      blockKey={block._key}
                      fieldName={fieldName}
                      meta={meta}
                      value={block[fieldName]}
                      onChange={(v) => updateField(block._key, fieldName, v)}
                    />
                  ))}
                </div>
              </CollapsibleContent>
            </div>
          </Collapsible>
        );
      })}

      {/* Add block buttons */}
      <div className="flex flex-wrap gap-2">
        {typeNames.map((typeName) => (
          <Button key={typeName} type="button" variant="outline" size="sm" onClick={() => addBlock(typeName)}>
            <Plus className="mr-1 size-3.5" />
            {humanize(typeName)}
          </Button>
        ))}
      </div>
    </div>
  );
}

// -----------------------------------------------
// Sub-field renderer
// -----------------------------------------------

function SubField({
  blockKey,
  fieldName,
  meta,
  value,
  onChange,
}: {
  blockKey: string;
  fieldName: string;
  meta: SubFieldMeta;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const label = meta.label ?? humanize(fieldName);
  const fieldId = `${blockKey}_${fieldName}`;

  return (
    <div className="grid gap-2">
      <Label htmlFor={fieldId}>
        {label}
        {meta.required ? " *" : ""}
      </Label>
      {meta.admin?.help && <p className="text-muted-foreground text-xs leading-5">{meta.admin.help}</p>}
      <SubFieldControl fieldId={fieldId} meta={meta} value={value} onChange={onChange} />
    </div>
  );
}

function SubFieldControl({
  fieldId,
  meta,
  value,
  onChange,
}: {
  fieldId: string;
  meta: SubFieldMeta;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const strValue = value == null ? "" : String(value);

  switch (meta.type) {
    case "text":
    case "email":
    case "date":
      return (
        <Input
          id={fieldId}
          type={meta.type === "email" ? "email" : meta.type === "date" ? "date" : "text"}
          value={strValue}
          placeholder={meta.admin?.placeholder ?? ""}
          required={meta.required}
          onChange={(e) => onChange(e.target.value)}
        />
      );

    case "number":
      return (
        <Input
          id={fieldId}
          type="number"
          value={strValue}
          required={meta.required}
          onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
        />
      );

    case "boolean":
      return (
        <span className="border-input bg-background inline-flex items-center gap-3 rounded-md border px-3 py-2 text-sm">
          <input
            id={fieldId}
            type="checkbox"
            className="border-input text-primary focus:ring-primary size-4 rounded"
            checked={Boolean(value)}
            onChange={(e) => onChange(e.target.checked)}
          />
          <span className="text-muted-foreground">{Boolean(value) ? "Enabled" : "Disabled"}</span>
        </span>
      );

    case "select":
      return (
        <SelectField
          name={fieldId}
          value={strValue}
          placeholder="Select an option"
          items={(meta.options ?? []).map((o) => ({ value: o, label: o }))}
          onChange={(v) => onChange(v)}
        />
      );

    case "richText":
      return (
        <RichTextEditor
          name={fieldId}
          initialValue={typeof value === "string" ? strValue : JSON.stringify(value ?? "")}
          rows={meta.admin?.rows ?? 8}
          onChange={(v) => {
            try {
              onChange(JSON.parse(v));
            } catch {
              onChange(v);
            }
          }}
        />
      );

    case "image":
      return (
        <ImagePicker
          name={fieldId}
          value={strValue}
          placeholder={meta.admin?.placeholder}
          onChange={(v) => onChange(v)}
        />
      );

    case "array":
      if (meta.of?.type === "image") {
        return <ArrayImageField fieldId={fieldId} value={value} onChange={onChange} />;
      }
      if (meta.of?.type === "text") {
        const items = Array.isArray(value) ? value : [];
        return (
          <Textarea
            id={fieldId}
            rows={meta.admin?.rows ?? 4}
            value={items.join("\n")}
            placeholder="One item per line"
            onChange={(e) => {
              const lines = e.target.value.split("\n").filter((l: string) => l.trim() !== "");
              onChange(lines);
            }}
          />
        );
      }
      // Fallback: JSON textarea
      return (
        <Textarea
          id={fieldId}
          rows={meta.admin?.rows ?? 5}
          value={typeof value === "string" ? strValue : JSON.stringify(value ?? [], null, 2)}
          onChange={(e) => {
            try {
              onChange(JSON.parse(e.target.value));
            } catch {
              onChange(e.target.value);
            }
          }}
        />
      );

    default:
      // Fallback: JSON textarea
      return (
        <Textarea
          id={fieldId}
          rows={meta.admin?.rows ?? 5}
          value={typeof value === "string" ? strValue : JSON.stringify(value ?? "", null, 2)}
          onChange={(e) => {
            try {
              onChange(JSON.parse(e.target.value));
            } catch {
              onChange(e.target.value);
            }
          }}
        />
      );
  }
}

// -----------------------------------------------
// Array of images sub-component
// -----------------------------------------------

function ArrayImageField({
  fieldId,
  value,
  onChange,
}: {
  fieldId: string;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const items: string[] = Array.isArray(value) ? value.map(String) : [];

  const addImage = useCallback(() => {
    onChange([...items, ""]);
  }, [items, onChange]);

  const removeImage = useCallback(
    (index: number) => {
      onChange(items.filter((_, i) => i !== index));
    },
    [items, onChange],
  );

  const updateImage = useCallback(
    (index: number, v: string) => {
      const next = [...items];
      next[index] = v;
      onChange(next);
    },
    [items, onChange],
  );

  return (
    <div className="space-y-3">
      {items.map((img, i) => (
        <div key={`${fieldId}_img_${i}`} className="relative">
          <ImagePicker name={`${fieldId}_img_${i}`} value={img} onChange={(v) => updateImage(i, v)} />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="text-destructive hover:text-destructive absolute top-0 right-0 size-7"
            onClick={() => removeImage(i)}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={addImage}>
        <Plus className="mr-1 size-3.5" />
        Add Image
      </Button>
    </div>
  );
}
