"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { GripVertical, ChevronRight, Plus, Trash2 } from "lucide-react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/admin/ui/button";
import { Input } from "@/components/admin/ui/input";
import { Label } from "@/components/admin/ui/label";
import { Textarea } from "@/components/admin/ui/textarea";
import RichTextEditor from "@/components/admin/RichTextEditor";
import ImagePicker from "@/components/admin/ImagePicker";
import SelectField from "@/components/admin/SelectField";

type SubFieldMeta = {
  type: string;
  label?: string;
  required?: boolean;
  options?: string[];
  from?: string;
  admin?: { placeholder?: string; rows?: number; help?: string; component?: string };
  defaultValue?: unknown;
  of?: { type: string };
  collection?: string;
  hasMany?: boolean;
};

type BlockTypesMeta = Record<string, Record<string, SubFieldMeta>>;

type Block = {
  _key: string;
  type: string;
  [field: string]: unknown;
};

type RelationOption = { value: string; label: string };

type Props = {
  name: string;
  value?: string;
  types: BlockTypesMeta;
  blockRelationOptions?: Record<string, RelationOption[]>;
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

// -----------------------------------------------
// Sortable block card
// -----------------------------------------------

function SortableBlock({
  block,
  fieldsMeta,
  isExpanded,
  autoFocus,
  onAutoFocused,
  onToggle,
  onRemove,
  onUpdateField,
  getRelationOptions,
}: {
  block: Block;
  fieldsMeta: Record<string, SubFieldMeta>;
  isExpanded: boolean;
  autoFocus?: boolean;
  onAutoFocused?: () => void;
  onToggle: () => void;
  onRemove: () => void;
  onUpdateField: (fieldName: string, value: unknown) => void;
  getRelationOptions: (blockType: string, fieldName: string) => RelationOption[];
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: block._key,
  });

  useEffect(() => {
    if (autoFocus && isExpanded && contentRef.current) {
      const input = contentRef.current.querySelector<HTMLElement>("input, textarea, [contenteditable]");
      if (input) {
        input.focus();
        onAutoFocused?.();
      }
    }
  }, [autoFocus, isExpanded, onAutoFocused]);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const preview = getPreviewText(block, fieldsMeta);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`rounded-lg border ${isDragging ? "z-10 opacity-90 shadow-lg" : ""}`}
    >
      {/* Header — entire row is clickable to expand/collapse */}
      <div
        className="hover:bg-muted/50 flex cursor-pointer items-center gap-2 px-3 py-2 transition-colors select-none"
        onClick={onToggle}
      >
        {/* Drag handle */}
        <button
          type="button"
          ref={setActivatorNodeRef}
          className="text-muted-foreground/50 hover:text-muted-foreground -ml-1 cursor-grab touch-none rounded p-1 transition-colors active:cursor-grabbing"
          {...attributes}
          {...listeners}
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="size-4" />
        </button>

        <ChevronRight
          className={`text-muted-foreground size-4 shrink-0 transition-transform ${isExpanded ? "rotate-90" : ""}`}
        />

        <span className="bg-secondary text-secondary-foreground rounded px-2 py-0.5 text-xs font-medium">
          {humanize(block.type)}
        </span>

        {!isExpanded && preview && <span className="text-muted-foreground min-w-0 truncate text-sm">{preview}</span>}

        <div className="ml-auto flex shrink-0 items-center">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            title="Remove block"
            className="text-muted-foreground hover:text-destructive size-7"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>

      {/* Content */}
      {isExpanded && (
        <div ref={contentRef} className="space-y-4 border-t px-4 py-4">
          {Object.entries(fieldsMeta).map(([fieldName, meta]) => (
            <SubField
              key={fieldName}
              blockKey={block._key}
              fieldName={fieldName}
              meta={meta}
              value={block[fieldName]}
              onChange={(v) => onUpdateField(fieldName, v)}
              relationOptions={meta.type === "relation" ? getRelationOptions(block.type, fieldName) : []}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// -----------------------------------------------
// Main editor
// -----------------------------------------------

export default function BlockEditor({ name, value, types, blockRelationOptions = {} }: Props) {
  const [blocks, setBlocks] = useState<Block[]>(() => parseBlocks(value, types));
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(() => new Set());
  const [newBlockKey, setNewBlockKey] = useState<string | null>(null);
  const hiddenRef = useRef<HTMLInputElement>(null);

  const typeNames = Object.keys(types);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const dispatchChange = useCallback(() => {
    if (hiddenRef.current) {
      hiddenRef.current.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }, []);

  const updateBlocks = useCallback(
    (updater: (prev: Block[]) => Block[]) => {
      setBlocks((prev) => {
        const next = updater(prev);
        setTimeout(dispatchChange, 0);
        return next;
      });
    },
    [dispatchChange],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      updateBlocks((prev) => {
        const oldIndex = prev.findIndex((b) => b._key === active.id);
        const newIndex = prev.findIndex((b) => b._key === over.id);
        if (oldIndex === -1 || newIndex === -1) return prev;
        return arrayMove(prev, oldIndex, newIndex);
      });
    },
    [updateBlocks],
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
      setNewBlockKey(newBlock._key);
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

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={blocks.map((b) => b._key)} strategy={verticalListSortingStrategy}>
          <div className="space-y-3">
            {blocks.map((block) => {
              const fieldsMeta = types[block.type] ?? {};
              return (
                <SortableBlock
                  key={block._key}
                  block={block}
                  fieldsMeta={fieldsMeta}
                  isExpanded={expandedKeys.has(block._key)}
                  autoFocus={newBlockKey === block._key}
                  onAutoFocused={() => setNewBlockKey(null)}
                  onToggle={() => toggleExpanded(block._key)}
                  onRemove={() => removeBlock(block._key)}
                  onUpdateField={(fn, v) => updateField(block._key, fn, v)}
                  getRelationOptions={(blockType, fieldName) =>
                    blockRelationOptions[`block:${blockType}:${fieldName}`] ?? []
                  }
                />
              );
            })}
          </div>
        </SortableContext>
      </DndContext>

      {/* Add block buttons */}
      <div className="flex flex-wrap gap-2">
        {typeNames.map((typeName) => (
          <Button
            key={typeName}
            type="button"
            variant="outline"
            size="sm"
            className="text-foreground/70"
            onClick={() => addBlock(typeName)}
          >
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
  relationOptions = [],
}: {
  blockKey: string;
  fieldName: string;
  meta: SubFieldMeta;
  value: unknown;
  onChange: (value: unknown) => void;
  relationOptions?: RelationOption[];
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
      <SubFieldControl
        fieldId={fieldId}
        meta={meta}
        value={value}
        onChange={onChange}
        relationOptions={relationOptions}
      />
    </div>
  );
}

function SubFieldControl({
  fieldId,
  meta,
  value,
  onChange,
  relationOptions = [],
}: {
  fieldId: string;
  meta: SubFieldMeta;
  value: unknown;
  onChange: (value: unknown) => void;
  relationOptions?: RelationOption[];
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
          <span className="text-muted-foreground">{value ? "Enabled" : "Disabled"}</span>
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

    case "relation": {
      const selected = meta.hasMany
        ? Array.isArray(value)
          ? (value as string[])
          : typeof value === "string" && value
            ? (() => {
                try {
                  return JSON.parse(value) as string[];
                } catch {
                  return [];
                }
              })()
            : []
        : value
          ? [String(value)]
          : [];
      const getLabel = (id: string) => relationOptions?.find((o) => o.value === id)?.label ?? id;
      const toggle = (id: string) => {
        if (meta.hasMany) {
          const next = selected.includes(id) ? selected.filter((v) => v !== id) : [...selected, id];
          onChange(next);
        } else {
          onChange(selected[0] === id ? "" : id);
        }
      };
      return (
        <div className="space-y-2">
          {meta.hasMany && selected.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {selected.map((id) => (
                <span
                  key={id}
                  className="bg-secondary text-secondary-foreground inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-sm"
                >
                  {getLabel(id)}
                  <button
                    type="button"
                    onClick={() => toggle(id)}
                    className="text-muted-foreground hover:text-foreground -mr-0.5 rounded p-0.5"
                  >
                    <Trash2 className="size-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <SelectField
            name={fieldId}
            value={meta.hasMany ? "" : (selected[0] ?? "")}
            placeholder={`Select ${meta.label?.toLowerCase() ?? "item"}...`}
            items={(relationOptions ?? []).map((o) => ({ value: o.value, label: o.label }))}
            onChange={(v) => {
              if (meta.hasMany && v) {
                if (!selected.includes(v)) onChange([...selected, v]);
              } else {
                onChange(v);
              }
            }}
          />
        </div>
      );
    }

    case "array":
      if (meta.of?.type === "image") {
        return <ArrayImageField fieldId={fieldId} value={value} onChange={onChange} />;
      }
      if (meta.of?.type === "text") {
        const items = Array.isArray(value) ? value : [];
        return (
          <Input
            id={fieldId}
            value={items.join(", ")}
            placeholder={meta.admin?.placeholder ?? "item1, item2, item3"}
            onChange={(e) => {
              const parts = e.target.value
                .split(",")
                .map((s: string) => s.trim())
                .filter(Boolean);
              onChange(parts);
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

    case "json":
      if (meta.admin?.component === "repeater") {
        return <RepeaterField fieldId={fieldId} value={value} onChange={onChange} />;
      }
      return (
        <Textarea
          id={fieldId}
          rows={meta.admin?.rows ?? 5}
          value={typeof value === "string" ? strValue : JSON.stringify(value ?? {}, null, 2)}
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

function RepeaterField({ value, onChange }: { fieldId: string; value: unknown; onChange: (value: unknown) => void }) {
  const [newItemKey, setNewItemKey] = useState<string | null>(null);
  const items: Array<Record<string, string>> = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? (() => {
          try {
            const p = JSON.parse(value);
            return Array.isArray(p) ? p : [];
          } catch {
            return [];
          }
        })()
      : [];

  // Detect fields from first item or default to title + description
  const fieldKeys = items.length > 0 ? Object.keys(items[0]).filter((k) => k !== "_key") : ["title", "description"];

  const addItem = () => {
    const key = generateKey();
    const blank: Record<string, string> = { _key: key };
    for (const k of fieldKeys) blank[k] = "";
    setNewItemKey(key);
    onChange([...items, blank]);
  };

  const removeItem = (index: number) => {
    onChange(items.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, key: string, val: string) => {
    const next = items.map((item, i) => (i === index ? { ...item, [key]: val } : item));
    onChange(next);
  };

  return (
    <div className="space-y-3">
      {items.map((item, index) => (
        // When a new item is added, use a ref callback to focus its first input on mount
        <div
          key={item._key ?? index}
          className="bg-muted/30 space-y-2 rounded-lg border p-3"
          ref={
            item._key === newItemKey
              ? (el) => {
                  if (el) {
                    const input = el.querySelector<HTMLElement>("input, textarea");
                    if (input) {
                      input.focus();
                      setNewItemKey(null);
                    }
                  }
                }
              : undefined
          }
        >
          {fieldKeys.map((key) => (
            <div key={key} className="grid gap-1">
              <Label className="text-xs">{humanize(key)}</Label>
              {key.includes("description") ||
              key.includes("body") ||
              key.includes("content") ||
              key.includes("answer") ? (
                <Textarea rows={3} value={item[key] ?? ""} onChange={(e) => updateItem(index, key, e.target.value)} />
              ) : (
                <Input value={item[key] ?? ""} onChange={(e) => updateItem(index, key, e.target.value)} />
              )}
            </div>
          ))}
          <div className="flex justify-end">
            <Button type="button" variant="ghost" size="icon-xs" title="Remove item" onClick={() => removeItem(index)}>
              <Trash2 className="size-3" />
            </Button>
          </div>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" className="text-foreground/70" onClick={addItem}>
        <Plus className="size-3.5" />
        Add item
      </Button>
    </div>
  );
}

function ArrayImageField({
  fieldId,
  value,
  onChange,
}: {
  fieldId: string;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const items: string[] = useMemo(() => (Array.isArray(value) ? value.map(String) : []), [value]);

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
