"use client";

import { useState, useCallback, useEffect, useRef } from "react";
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
import {
  SubField,
  blankBlockFields,
  generateKey,
  getPreviewText,
  humanize,
  type BlockTypesMeta,
  type RelationOption,
  type SubFieldMeta,
} from "./block-fields";

type Block = {
  _key: string;
  type: string;
  [field: string]: unknown;
};

type Props = {
  name: string;
  value?: string;
  types: BlockTypesMeta;
  blockRelationOptions?: Record<string, RelationOption[]>;
};

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
      className={cn("overflow-hidden rounded-lg border", isDragging && "z-10 opacity-90 shadow-lg")}
    >
      {/* Header — entire row is clickable to expand/collapse */}
      <div
        className="group/row hover:bg-muted/80 flex items-center gap-2 px-3 py-2 transition-colors select-none"
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
          className={cn(
            "text-muted-foreground group-hover/row:text-foreground/70 size-4 shrink-0 transition-[color,transform]",
            isExpanded && "rotate-90",
          )}
        />

        <span className="bg-secondary text-secondary-foreground rounded px-2 py-0.5 text-xs font-medium">
          {humanize(block.type)}
        </span>

        {!isExpanded && preview && (
          <span className="text-muted-foreground group-hover/row:text-foreground/70 min-w-0 truncate text-sm transition-colors">
            {preview}
          </span>
        )}

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
  const savedExpandedRef = useRef<Set<string> | null>(null);
  const hiddenRef = useRef<HTMLInputElement>(null);
  const previewChannelRef = useRef<BroadcastChannel | null>(null);

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

  // Live preview: broadcast block data for server-side rendering
  useEffect(() => {
    if (!previewChannelRef.current) previewChannelRef.current = new BroadcastChannel("cms-preview");
    previewChannelRef.current.postMessage({ field: name, value: serializeBlocks(blocks), render: "blocks" });
  }, [blocks, name]);

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

  const handleDragStart = useCallback(() => {
    savedExpandedRef.current = new Set(expandedKeys);
    setExpandedKeys(new Set());
  }, [expandedKeys]);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      if (savedExpandedRef.current) {
        setExpandedKeys(savedExpandedRef.current);
        savedExpandedRef.current = null;
      }
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
      const newBlock: Block = { _key: generateKey(), type: typeName, ...blankBlockFields(fieldsMeta) };
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

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
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
                    blockRelationOptions[`block:${name}:${blockType}:${fieldName}`] ?? []
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
