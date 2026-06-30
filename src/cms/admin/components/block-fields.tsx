"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { GripVertical, ChevronRight, Plus, Trash2 } from "lucide-react";
import { cn } from "../lib/utils";
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
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import RichTextEditor from "./RichTextEditor";
import ImagePicker from "./ImagePicker";
import SelectField from "./SelectField";
import ColorField from "./ColorField";
import LinkField from "./LinkField";
import YoutubeField from "./YoutubeField";

// -----------------------------------------------
// Shared types — describe a block sub-field. Used by both the standalone
// `blocks` editor (BlockEditor) and the inline `content` editor (ContentEditor).
// -----------------------------------------------

export type SubFieldMeta = {
  type: string;
  label?: string;
  required?: boolean;
  options?: string[];
  from?: string;
  admin?: { placeholder?: string; rows?: number; help?: string; component?: string };
  defaultValue?: unknown;
  /** Predefined palette for `admin.component === "color"` sub-fields. */
  colors?: { label: string; value: string }[];
  of?: { type: string };
  collection?: string;
  hasMany?: boolean;
  /** Typed repeater row schema (json + admin.component "repeater"). */
  itemFields?: Record<string, SubFieldMeta>;
};

export type BlockTypesMeta = Record<string, Record<string, SubFieldMeta>>;

export type RelationOption = { value: string; label: string };

export function generateKey() {
  return "blk_" + Math.random().toString(36).slice(2, 9);
}

export function humanize(value: string) {
  return value
    .replace(/^_+/, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[-_]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\w/, (char) => char.toUpperCase());
}

/** Build a blank value object for a freshly inserted block of the given type. */
export function blankBlockFields(fieldsMeta: Record<string, SubFieldMeta>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [fieldName, meta] of Object.entries(fieldsMeta)) {
    if (meta.defaultValue !== undefined) out[fieldName] = meta.defaultValue;
    else if (meta.type === "boolean") out[fieldName] = false;
    else if (meta.type === "array") out[fieldName] = [];
    else out[fieldName] = "";
  }
  return out;
}

/** First text-ish field value, truncated — used for collapsed block previews. */
export function getPreviewText(values: Record<string, unknown>, fieldsMeta: Record<string, SubFieldMeta>): string {
  for (const [key, meta] of Object.entries(fieldsMeta)) {
    if (meta.type === "text" && values[key]) {
      const text = String(values[key]);
      return text.length > 60 ? text.slice(0, 60) + "..." : text;
    }
  }
  return "";
}

// -----------------------------------------------
// Sub-field label + control wrapper
// -----------------------------------------------

export function SubField({
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

function JsonTextarea({
  fieldId,
  rows,
  value,
  fallback,
  onChange,
}: {
  fieldId: string;
  rows: number;
  value: unknown;
  fallback: unknown;
  onChange: (value: unknown) => void;
}) {
  const strValue = value == null ? "" : String(value);
  return (
    <Textarea
      id={fieldId}
      rows={rows}
      value={typeof value === "string" ? strValue : JSON.stringify(value ?? fallback, null, 2)}
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

function parseSelected(meta: SubFieldMeta, value: unknown): string[] {
  if (!meta.hasMany) return value ? [String(value)] : [];
  if (Array.isArray(value)) return value as string[];
  if (typeof value === "string" && value) {
    try {
      return JSON.parse(value) as string[];
    } catch {
      return [];
    }
  }
  return [];
}

function RelationControl({
  fieldId,
  meta,
  value,
  onChange,
  relationOptions,
}: {
  fieldId: string;
  meta: SubFieldMeta;
  value: unknown;
  onChange: (value: unknown) => void;
  relationOptions: RelationOption[];
}) {
  const selected = parseSelected(meta, value);
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

function ArrayControl({
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
  return (
    <JsonTextarea fieldId={fieldId} rows={meta.admin?.rows ?? 5} value={value} fallback={[]} onChange={onChange} />
  );
}

export function SubFieldControl({
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

  // Colour fields render a palette dropdown regardless of their (text) storage type.
  if (meta.admin?.component === "color") {
    return (
      <ColorField value={strValue} placeholder={meta.admin?.placeholder} colors={meta.colors} onChange={onChange} />
    );
  }

  // Link fields render a structured URL + label + new-tab control.
  if (meta.admin?.component === "link") {
    return <LinkField value={value as never} onChange={onChange} />;
  }

  // YouTube fields render a URL input with a thumbnail preview.
  if (meta.admin?.component === "youtube") {
    return <YoutubeField value={strValue} placeholder={meta.admin?.placeholder} onChange={(v) => onChange(v)} />;
  }

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
        <span className="inline-flex items-center gap-3 text-sm">
          <input
            id={fieldId}
            type="checkbox"
            className="border-input text-primary focus:ring-primary size-4 rounded"
            checked={Boolean(value)}
            onChange={(e) => onChange(e.target.checked)}
          />
          <span className="text-muted-foreground">{value ? "true" : "false"}</span>
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

    case "relation":
      return (
        <RelationControl
          fieldId={fieldId}
          meta={meta}
          value={value}
          onChange={onChange}
          relationOptions={relationOptions}
        />
      );

    case "array":
      return <ArrayControl fieldId={fieldId} meta={meta} value={value} onChange={onChange} />;

    case "json":
      if (meta.admin?.component === "repeater") {
        return (
          <RepeaterField
            blockKey={fieldId}
            itemFields={meta.itemFields}
            relationOptions={relationOptions}
            value={value}
            onChange={onChange}
          />
        );
      }
      return (
        <JsonTextarea fieldId={fieldId} rows={meta.admin?.rows ?? 5} value={value} fallback={{}} onChange={onChange} />
      );

    default:
      return (
        <JsonTextarea fieldId={fieldId} rows={meta.admin?.rows ?? 5} value={value} fallback="" onChange={onChange} />
      );
  }
}

// -----------------------------------------------
// Repeater (json + admin.component === "repeater")
// -----------------------------------------------

function getRepeaterPreview(item: Record<string, unknown>, fieldKeys: string[]): string {
  for (const key of fieldKeys) {
    const v = item[key];
    if (v == null || v === "" || typeof v === "object") continue;
    const text = String(v);
    if (text) return text.length > 60 ? text.slice(0, 60) + "..." : text;
  }
  return "";
}

function SortableRepeaterItem({
  blockKey,
  item,
  fieldKeys,
  itemFields,
  relationOptions,
  index,
  isExpanded,
  autoFocus,
  onAutoFocused,
  onToggle,
  onRemove,
  onUpdate,
}: {
  blockKey: string;
  item: Record<string, unknown>;
  fieldKeys: string[];
  itemFields?: Record<string, SubFieldMeta>;
  relationOptions?: RelationOption[];
  index: number;
  isExpanded: boolean;
  autoFocus?: boolean;
  onAutoFocused?: () => void;
  onToggle: () => void;
  onRemove: () => void;
  onUpdate: (key: string, val: unknown) => void;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: String(item._key),
  });

  useEffect(() => {
    if (autoFocus && isExpanded && contentRef.current) {
      const input = contentRef.current.querySelector<HTMLElement>("input, textarea");
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

  const preview = getRepeaterPreview(item, fieldKeys);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn("overflow-hidden rounded-lg border", isDragging && "z-10 opacity-90 shadow-lg")}
    >
      <div
        className="group/row hover:bg-muted/80 flex items-center gap-2 px-3 py-2 transition-colors select-none"
        onClick={onToggle}
      >
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
          className={cn(
            "text-muted-foreground group-hover/row:text-foreground/70 size-4 shrink-0 transition-[color,transform]",
            isExpanded && "rotate-90",
          )}
        />

        <span className="text-muted-foreground group-hover/row:text-foreground/70 text-xs font-medium transition-colors">
          #{index + 1}
        </span>

        {!isExpanded && preview && (
          <span className="text-muted-foreground group-hover/row:text-foreground/70 min-w-0 truncate text-sm transition-colors">
            {preview}
          </span>
        )}

        <div className="ml-auto">
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            title="Remove item"
            className="text-muted-foreground hover:text-destructive"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>

      {isExpanded && (
        <div ref={contentRef} className="space-y-3 border-t px-4 py-3">
          {itemFields
            ? fieldKeys.map((key) => (
                <SubField
                  key={key}
                  blockKey={`${blockKey}_${index}`}
                  fieldName={key}
                  meta={itemFields[key]}
                  value={item[key]}
                  onChange={(v) => onUpdate(key, v)}
                  relationOptions={relationOptions}
                />
              ))
            : fieldKeys.map((key) => (
                <div key={key} className="grid gap-1">
                  <Label className="text-xs">{humanize(key)}</Label>
                  {key.includes("description") ||
                  key.includes("body") ||
                  key.includes("content") ||
                  key.includes("answer") ? (
                    <Textarea
                      rows={3}
                      value={String(item[key] ?? "")}
                      onChange={(e) => onUpdate(key, e.target.value)}
                    />
                  ) : (
                    <Input value={String(item[key] ?? "")} onChange={(e) => onUpdate(key, e.target.value)} />
                  )}
                </div>
              ))}
        </div>
      )}
    </div>
  );
}

function parseArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const p = JSON.parse(value);
      if (Array.isArray(p)) return p;
    } catch {}
  }
  return [];
}

function RepeaterField({
  blockKey,
  itemFields,
  relationOptions,
  value,
  onChange,
}: {
  blockKey: string;
  itemFields?: Record<string, SubFieldMeta>;
  relationOptions?: RelationOption[];
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const [newItemKey, setNewItemKey] = useState<string | null>(null);
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(() => new Set());
  const savedExpandedRef = useRef<Set<string> | null>(null);
  const [items, setItems] = useState<Array<Record<string, unknown>>>(() => {
    const raw = parseArray(value);
    return raw.map((item: unknown) => {
      const obj = (item ?? {}) as Record<string, unknown>;
      return obj._key ? obj : { ...obj, _key: generateKey() };
    });
  });

  useEffect(() => {
    onChange(items);
  }, [items]); // eslint-disable-line react-hooks/exhaustive-deps

  // Typed rows use the declared itemFields; legacy rows auto-detect string keys.
  const fieldKeys = itemFields
    ? Object.keys(itemFields)
    : items.length > 0
      ? Object.keys(items[0]).filter((k) => k !== "_key")
      : ["title", "description"];

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const addItem = () => {
    const key = generateKey();
    const blank: Record<string, unknown> = { _key: key };
    for (const k of fieldKeys) {
      const fieldMeta = itemFields?.[k];
      if (fieldMeta?.defaultValue !== undefined) blank[k] = fieldMeta.defaultValue;
      else if (fieldMeta?.type === "boolean") blank[k] = false;
      else if (fieldMeta?.type === "array") blank[k] = [];
      else blank[k] = "";
    }
    setNewItemKey(key);
    setItems((prev) => [...prev, blank]);
    setExpandedKeys((prev) => new Set(prev).add(key));
  };

  const removeItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, key: string, val: unknown) => {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, [key]: val } : item)));
  };

  const toggleExpanded = (key: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleDragStart = () => {
    savedExpandedRef.current = new Set(expandedKeys);
    setExpandedKeys(new Set());
  };

  const handleDragEnd = (event: DragEndEvent) => {
    if (savedExpandedRef.current) {
      setExpandedKeys(savedExpandedRef.current);
      savedExpandedRef.current = null;
    }
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setItems((prev) => {
      const oldIndex = prev.findIndex((item) => item._key === active.id);
      const newIndex = prev.findIndex((item) => item._key === over.id);
      if (oldIndex === -1 || newIndex === -1) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  };

  return (
    <div className="space-y-3">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={items.map((item) => String(item._key))} strategy={verticalListSortingStrategy}>
          {items.map((item, index) => (
            <SortableRepeaterItem
              key={String(item._key ?? index)}
              blockKey={blockKey}
              item={item}
              fieldKeys={fieldKeys}
              itemFields={itemFields}
              relationOptions={relationOptions}
              index={index}
              isExpanded={expandedKeys.has(String(item._key))}
              autoFocus={newItemKey === item._key}
              onAutoFocused={() => setNewItemKey(null)}
              onToggle={() => toggleExpanded(String(item._key))}
              onRemove={() => removeItem(index)}
              onUpdate={(key, val) => updateItem(index, key, val)}
            />
          ))}
        </SortableContext>
      </DndContext>
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
            className="text-muted-foreground hover:text-destructive absolute top-0 right-0 size-7"
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
