"use client";

import { useEffect, useRef, useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Plus, Trash2 } from "lucide-react";

import { Button } from "./ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "./ui/sheet";
import { cn } from "../lib/utils";
import DocumentCombobox, { useRelationLabels } from "./DocumentCombobox";

type Option = { value: string; label: string };

type Props = {
  name: string;
  value?: string;
  hasMany?: boolean;
  maxItems?: number;
  /** Labels already known for selected values (optional seed — anything missing is resolved on mount). */
  options?: Option[];
  collectionSlug: string;
  collectionLabel: string;
  labelField?: string;
};

/**
 * One selected document as a full-width draggable row — hasMany order is data,
 * so it is editable. Mirrors the repeater's row anatomy (grip, #index, remove)
 * for a consistent, easy-to-grab drag target.
 */
function SortableRow({
  id,
  index,
  label,
  onRemove,
}: {
  id: string;
  index: number;
  label: string;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "bg-field flex items-center gap-2 rounded-lg border px-3 py-2 transition-colors",
        isDragging && "z-10 opacity-90 shadow-lg",
      )}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        data-drag-handle
        className="text-muted-foreground/50 hover:text-muted-foreground -ml-1 cursor-grab touch-none rounded p-1 transition-colors active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>
      <span className="text-muted-foreground text-xs font-medium">#{index + 1}</span>
      <span className="min-w-0 flex-1 truncate text-sm">{label}</span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        title="Remove"
        className="text-muted-foreground hover:text-destructive size-7"
        onClick={onRemove}
      >
        <Trash2 className="size-3.5" />
      </Button>
    </div>
  );
}

export default function RelationField({
  name,
  value: initialValue,
  hasMany = false,
  maxItems,
  options: initialOptions = [],
  collectionSlug,
  collectionLabel,
  labelField = "title",
}: Props) {
  const [selected, setSelected] = useState<string[]>(() => {
    if (!initialValue) return [];
    if (hasMany) {
      try {
        const parsed = JSON.parse(initialValue);
        return Array.isArray(parsed) ? parsed.map(String) : [];
      } catch {
        return [];
      }
    }
    return initialValue ? [initialValue] : [];
  });
  const { getLabel: findLabel, getPinned, remember } = useRelationLabels(collectionSlug, selected, initialOptions);
  const [sheetOpen, setSheetOpen] = useState(false);

  const hiddenRef = useRef<HTMLInputElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const hiddenValue = hasMany ? JSON.stringify(selected) : (selected[0] ?? "");

  // Notify form of changes so UnsavedGuard can detect them
  useEffect(() => {
    hiddenRef.current?.dispatchEvent(new Event("change", { bubbles: true }));
  }, [hiddenValue]);

  const getLabel = (id: string) => findLabel(id) ?? "…";

  const atMax = hasMany && maxItems !== undefined && selected.length >= maxItems;

  const displayLabel =
    selected.length === 0
      ? ""
      : hasMany
        ? maxItems
          ? `${selected.length}/${maxItems} selected`
          : `${selected.length} selected`
        : getLabel(selected[0]);

  const selectItem = (id: string) => {
    if (hasMany) {
      setSelected((prev) => {
        if (prev.includes(id)) return prev.filter((v) => v !== id);
        if (maxItems !== undefined && prev.length >= maxItems) return prev;
        return [...prev, id];
      });
    } else {
      setSelected((prev) => (prev[0] === id ? [] : [id]));
    }
  };

  const remove = (id: string) => {
    setSelected((prev) => prev.filter((v) => v !== id));
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setSelected((prev) => arrayMove(prev, prev.indexOf(String(active.id)), prev.indexOf(String(over.id))));
  };

  // Listen for postMessage from embedded iframe after successful save
  useEffect(() => {
    if (!sheetOpen) return;

    const handleMessage = (e: MessageEvent) => {
      if (e.data?.type !== "cms:created") return;
      const docId = String(e.data.id);
      fetch(`/api/cms/${collectionSlug}/${docId}?status=any`)
        .then((res) => (res.ok ? res.json() : null))
        .then((doc) => {
          if (doc) {
            const label = String(doc[labelField] ?? doc.slug ?? docId);
            remember([{ docId, title: label }]);
            if (hasMany) {
              setSelected((prev) => (prev.includes(docId) ? prev : [...prev, docId]));
            } else {
              setSelected([docId]);
            }
          }
          setSheetOpen(false);
        });
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [sheetOpen, collectionSlug, hasMany, labelField, remember]);

  return (
    <div className="space-y-2">
      <input ref={hiddenRef} type="hidden" name={name} value={hiddenValue} />

      {/* Selected items (hasMany rows) — drag to reorder; the stored order is the render order */}
      {hasMany && selected.length > 0 && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={selected} strategy={verticalListSortingStrategy}>
            <div className="grid gap-2">
              {selected.map((id, index) => (
                <SortableRow key={id} id={id} index={index} label={getLabel(id)} onRemove={() => remove(id)} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <DocumentCombobox
        collections={[collectionSlug]}
        pinned={getPinned(selected)}
        placeholder={`Search ${collectionLabel.toLowerCase()}...`}
        display={displayLabel}
        isSelected={(hit) => selected.includes(hit.docId)}
        onPick={(hit) => {
          remember([hit]);
          selectItem(hit.docId);
        }}
        closeOnPick={!hasMany}
        dimUnselected={atMax}
        size="lg"
      />

      {/* Create new button */}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="text-foreground/70"
        onClick={() => setSheetOpen(true)}
      >
        <Plus className="size-3.5" />
        Create {collectionLabel.toLowerCase()}
      </Button>

      {/* Create sheet — full-width iframe with the actual add-new page */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent
          side="right"
          className="data-[side=right]:w-[90vw] data-[side=right]:sm:max-w-[90vw] data-[side=right]:lg:w-[50vw] data-[side=right]:lg:max-w-[50vw]"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Create {collectionLabel.toLowerCase()}</SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-hidden">
            {sheetOpen && (
              <iframe
                ref={iframeRef}
                src={`/admin/${collectionSlug}/new?_embed=1`}
                title={`Create ${collectionLabel}`}
                className="size-full"
              />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
