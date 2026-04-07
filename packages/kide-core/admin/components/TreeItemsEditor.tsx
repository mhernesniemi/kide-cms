"use client";

import * as React from "react";
import {
  Check,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  GripVertical,
  Indent,
  Outdent,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "./ui/collapsible";
import { cn } from "../lib/utils";
import InternalLinkPicker, { type LinkOptionGroup } from "./InternalLinkPicker";
import {
  type TreeItem,
  generateId,
  slugify,
  parseItems,
  cloneItems,
  createBlankItem,
  getItemLabel,
  getItemSublabel,
  findItemById,
  findParentList,
  findItemDepth,
  canIndent,
  canOutdent,
} from "./tree-utils";

// --- Types ---

type EditState = {
  id: string;
  label: string;
  href: string;
  target: string;
  linkType: "external" | "internal";
  name: string;
  slug: string;
  autoSlug: boolean;
};

type Props = {
  name: string;
  value?: string;
  variant: "menu" | "taxonomy";
  label?: string;
  linkOptions?: LinkOptionGroup[];
};

function blankEdit(id: string): EditState {
  return { id, label: "", href: "", target: "", linkType: "internal", name: "", slug: "", autoSlug: true };
}

// --- Sortable wrapper ---

function SortableTreeItem({
  id,
  disabled,
  children,
}: {
  id: string;
  disabled?: boolean;
  children: (props: {
    attributes: ReturnType<typeof useSortable>["attributes"];
    listeners: ReturnType<typeof useSortable>["listeners"];
    setNodeRef: (node: HTMLElement | null) => void;
    setActivatorNodeRef: (node: HTMLElement | null) => void;
    style: React.CSSProperties;
    isDragging: boolean;
  }) => React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled,
  });

  const style: React.CSSProperties = {
    transform: transform ? `translate3d(${Math.round(transform.x)}px, ${Math.round(transform.y)}px, 0)` : undefined,
    transition,
  };

  return <>{children({ attributes, listeners, setNodeRef, setActivatorNodeRef, style, isDragging })}</>;
}

// --- Main component ---

export default function TreeItemsEditor({ name, value, variant, label, linkOptions = [] }: Props) {
  const [items, setItems] = React.useState<TreeItem[]>(() => parseItems(value));
  const [editing, setEditing] = React.useState<EditState | null>(null);
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const newItemIds = React.useRef(new Set<string>());
  const hiddenRef = React.useRef<HTMLInputElement>(null);

  const updateEditing = (patch: Partial<EditState>) => setEditing((prev) => (prev ? { ...prev, ...patch } : prev));

  const [expandedIds, setExpandedIds] = React.useState<Set<string>>(() => {
    const ids = new Set<string>();
    const collectIds = (list: TreeItem[]) => {
      for (const item of list) {
        if (item.children.length > 0) ids.add(item.id);
        collectIds(item.children);
      }
    };
    collectIds(parseItems(value));
    return ids;
  });

  // Serialized value includes any pending inline edit
  const serialized = React.useMemo(() => {
    if (!editing) return JSON.stringify(items);
    const merged = cloneItems(items);
    const apply = (list: TreeItem[]) => {
      for (const item of list) {
        if (item.id === editing.id) {
          if (variant === "menu") {
            item.label = editing.label;
            item.href = editing.href;
            item.target = editing.target || undefined;
          } else {
            item.name = editing.name;
            item.slug = editing.slug || slugify(editing.name);
          }
          return;
        }
        apply(item.children);
      }
    };
    apply(merged);
    return JSON.stringify(merged);
  }, [items, editing, variant]);

  // Notify form of changes so UnsavedGuard can detect them
  React.useEffect(() => {
    hiddenRef.current?.dispatchEvent(new Event("change", { bubbles: true }));
  }, [serialized]);

  // --- Tree operations ---

  const allParentIds = React.useMemo(() => {
    const ids = new Set<string>();
    const collect = (list: TreeItem[]) => {
      for (const item of list) {
        if (item.children.length > 0) {
          ids.add(item.id);
          collect(item.children);
        }
      }
    };
    collect(items);
    return ids;
  }, [items]);

  const hasExpandableItems = allParentIds.size > 0;
  const allExpanded = hasExpandableItems && [...allParentIds].every((id) => expandedIds.has(id));

  const toggleExpandAll = () => {
    setExpandedIds(allExpanded ? new Set() : new Set(allParentIds));
  };

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const removeItem = (id: string) => {
    setItems((prev) => {
      const next = cloneItems(prev);
      const remove = (list: TreeItem[]): TreeItem[] =>
        list.filter((item) => {
          if (item.id === id) return false;
          item.children = remove(item.children);
          return true;
        });
      return remove(next);
    });
    if (editing?.id === id) setEditing(null);
  };

  const saveEdit = () => {
    if (!editing) return;
    newItemIds.current.delete(editing.id);
    setItems((prev) => {
      const next = cloneItems(prev);
      const update = (list: TreeItem[]) => {
        for (const item of list) {
          if (item.id === editing.id) {
            if (variant === "menu") {
              item.label = editing.label;
              item.href = editing.href;
              item.target = editing.target || undefined;
            } else {
              item.name = editing.name;
              item.slug = editing.slug || slugify(editing.name);
            }
            return;
          }
          update(item.children);
        }
      };
      update(next);
      return next;
    });
    setEditing(null);
  };

  const cancelEdit = () => {
    if (editing && newItemIds.current.has(editing.id)) {
      removeItem(editing.id);
      newItemIds.current.delete(editing.id);
    }
    setEditing(null);
  };

  const saveOrDiscardEdit = () => {
    if (!editing) return;
    const isEmpty = variant === "menu" ? !editing.label.trim() && !editing.href.trim() : !editing.name.trim();
    if (isEmpty) {
      removeItem(editing.id);
      newItemIds.current.delete(editing.id);
      setEditing(null);
    } else {
      saveEdit();
    }
  };

  const startEditNewItem = (id: string) => {
    newItemIds.current.add(id);
    setEditing(blankEdit(id));
  };

  const addRootItem = () => {
    saveOrDiscardEdit();
    const newItem = createBlankItem();
    setItems((prev) => [...prev, newItem]);
    startEditNewItem(newItem.id);
  };

  const addChildItem = (parentId: string) => {
    saveOrDiscardEdit();
    const newItem = createBlankItem();
    setItems((prev) => {
      const next = cloneItems(prev);
      const addToParent = (list: TreeItem[]): boolean => {
        for (const item of list) {
          if (item.id === parentId) {
            item.children.push(newItem);
            return true;
          }
          if (addToParent(item.children)) return true;
        }
        return false;
      };
      addToParent(next);
      setExpandedIds((prev) => new Set([...prev, parentId]));
      return next;
    });
    startEditNewItem(newItem.id);
  };

  const startEdit = (item: TreeItem) => {
    if (variant === "menu") {
      const isInternal = linkOptions.some((group) => group.items.some((li) => li.href === String(item.href ?? "")));
      setEditing({
        ...blankEdit(item.id),
        label: String(item.label ?? ""),
        href: String(item.href ?? ""),
        target: String(item.target ?? ""),
        linkType: isInternal ? "internal" : "external",
      });
    } else {
      setEditing({
        ...blankEdit(item.id),
        name: String(item.name ?? ""),
        slug: String(item.slug ?? ""),
        autoSlug: false,
      });
    }
  };

  const indentItem = (id: string) => {
    setItems((prev) => {
      const next = cloneItems(prev);
      const doIndent = (list: TreeItem[]): boolean => {
        for (let i = 0; i < list.length; i++) {
          if (list[i].id === id && i > 0) {
            const [item] = list.splice(i, 1);
            list[i - 1].children.push(item);
            setExpandedIds((prev) => new Set([...prev, list[i - 1].id]));
            return true;
          }
          if (doIndent(list[i].children)) return true;
        }
        return false;
      };
      doIndent(next);
      return next;
    });
  };

  const outdentItem = (id: string) => {
    setItems((prev) => {
      const next = cloneItems(prev);
      const doOutdent = (list: TreeItem[], parentList: TreeItem[] | null): boolean => {
        for (let i = 0; i < list.length; i++) {
          if (list[i].id === id && parentList) {
            const [item] = list.splice(i, 1);
            const parentIdx = parentList.findIndex((p) => p.children === list);
            if (parentIdx >= 0) {
              parentList.splice(parentIdx + 1, 0, item);
              return true;
            }
          }
          if (doOutdent(list[i].children, list)) return true;
        }
        return false;
      };
      doOutdent(next, null);
      return next;
    });
  };

  const editKeyHandler = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") saveEdit();
    if (e.key === "Escape") cancelEdit();
  };

  // --- Drag and drop ---

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleDragStart = React.useCallback((event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  }, []);

  const handleDragEnd = React.useCallback((event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setItems((prev) => {
      const next = cloneItems(prev);
      const activeSiblings = findParentList(next, String(active.id));
      const overSiblings = findParentList(next, String(over.id));
      if (!activeSiblings || !overSiblings || activeSiblings !== overSiblings) return prev;

      const oldIndex = activeSiblings.findIndex((item) => item.id === active.id);
      const newIndex = activeSiblings.findIndex((item) => item.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return prev;

      const reordered = arrayMove(activeSiblings, oldIndex, newIndex);
      activeSiblings.splice(0, activeSiblings.length, ...reordered);
      return next;
    });
  }, []);

  const handleDragCancel = React.useCallback(() => {
    setActiveId(null);
  }, []);

  const isAncestorOfActive = React.useCallback(
    (item: TreeItem): boolean => {
      if (!activeId) return false;
      const check = (children: TreeItem[]): boolean => {
        for (const child of children) {
          if (child.id === activeId) return true;
          if (check(child.children)) return true;
        }
        return false;
      };
      return check(item.children);
    },
    [activeId],
  );

  const activeItem = activeId ? findItemById(items, activeId) : null;
  const activeDepth = activeId ? findItemDepth(items, activeId) : 0;

  // Collapse siblings of dragged item during drag for uniform height
  const activeSiblingIds = React.useMemo(() => {
    if (!activeId) return null;
    const parentList = findParentList(items, activeId);
    if (!parentList) return null;
    return new Set(parentList.map((item) => item.id));
  }, [activeId, items]);

  // --- Edit fields ---

  const renderEditFields = () => {
    if (!editing) return null;
    if (variant === "menu") {
      return (
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Input
            value={editing.label}
            onChange={(e) => updateEditing({ label: e.target.value })}
            placeholder="Label"
            className="h-7 min-w-0 flex-3 text-sm"
            autoFocus
            onKeyDown={editKeyHandler}
          />
          <Select
            items={[
              { value: "external", label: "External link" },
              { value: "internal", label: "Internal link" },
            ]}
            value={editing.linkType}
            onValueChange={(v) => {
              const newType = (v as "external" | "internal") ?? "external";
              updateEditing({ linkType: newType, ...(newType === "internal" ? { href: "" } : {}) });
            }}
          >
            <SelectTrigger className="h-7! min-w-0 flex-2 text-sm">
              <SelectValue placeholder="Link type" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="external">External link</SelectItem>
                <SelectItem value="internal">Internal link</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
          {editing.linkType === "external" ? (
            <Input
              value={editing.href}
              onChange={(e) => updateEditing({ href: e.target.value })}
              placeholder="https://..."
              className="h-7 min-w-0 flex-3 text-sm"
              onKeyDown={editKeyHandler}
            />
          ) : (
            <InternalLinkPicker
              editHref={editing.href}
              linkOptions={linkOptions}
              onSelect={(item) => {
                updateEditing({ href: item.href, ...(!editing.label ? { label: item.label } : {}) });
              }}
            />
          )}
        </div>
      );
    }
    return (
      <>
        <Input
          value={editing.name}
          onChange={(e) => {
            const name = e.target.value;
            updateEditing({ name, ...(editing.autoSlug ? { slug: slugify(name) } : {}) });
          }}
          placeholder="Name"
          className="h-7 flex-1 text-sm"
          autoFocus
          onKeyDown={editKeyHandler}
        />
        <Input
          value={editing.slug}
          onChange={(e) => updateEditing({ slug: e.target.value, autoSlug: false })}
          placeholder="slug"
          className="h-7 w-36 text-sm"
          onKeyDown={editKeyHandler}
        />
      </>
    );
  };

  // --- Tree rendering ---

  const renderItem = (item: TreeItem, depth: number) => {
    const hasChildren = item.children.length > 0;
    const isDragSibling = activeSiblingIds?.has(item.id) ?? false;
    const isExpanded = expandedIds.has(item.id) && !isDragSibling;
    const isEditing = editing?.id === item.id;
    const sortDisabled = isAncestorOfActive(item);

    return (
      <SortableTreeItem key={item.id} id={item.id} disabled={sortDisabled}>
        {({ attributes, listeners, setNodeRef, setActivatorNodeRef, style, isDragging }) => (
          <Collapsible open={isExpanded}>
            <div ref={setNodeRef} style={style} className={cn(isDragging && "z-10 opacity-30")}>
              <div
                className="hover:bg-accent/40 flex items-center gap-1 border-b py-1.5 pr-2 text-sm transition-colors"
                style={{ paddingLeft: `${depth * 1.5 + 0.25}rem` }}
              >
                <button
                  type="button"
                  ref={setActivatorNodeRef}
                  className="text-muted-foreground/50 hover:text-muted-foreground -ml-0.5 cursor-grab touch-none rounded p-0.5 transition-colors active:cursor-grabbing"
                  {...attributes}
                  {...listeners}
                >
                  <GripVertical className="size-3.5" />
                </button>

                {hasChildren ? (
                  <CollapsibleTrigger
                    onClick={() => toggleExpand(item.id)}
                    className="text-muted-foreground hover:text-foreground flex size-6 shrink-0 items-center justify-center rounded-md transition-colors"
                  >
                    <ChevronRight
                      className="size-3.5 transition-transform duration-150"
                      style={{ transform: isExpanded ? "rotate(90deg)" : undefined }}
                    />
                  </CollapsibleTrigger>
                ) : (
                  <span className="size-6 shrink-0" />
                )}

                {isEditing ? (
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    {renderEditFields()}
                    <Button variant="ghost" size="icon-sm" className="size-7" onClick={saveEdit} title="Save">
                      <Check className="size-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon-sm" className="size-7" onClick={cancelEdit} title="Cancel">
                      <X className="size-3.5" />
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <span className="truncate font-medium">{getItemLabel(item, variant)}</span>
                      {variant === "menu" && (
                        <span className="text-muted-foreground truncate text-xs">{getItemSublabel(item, variant)}</span>
                      )}
                      {variant === "menu" && item.target === "_blank" && (
                        <span className="text-muted-foreground text-xs">(new tab)</span>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="size-7"
                        title="Indent"
                        onClick={() => indentItem(item.id)}
                        disabled={!canIndent(items, item.id)}
                      >
                        <Indent className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="size-7"
                        title="Outdent"
                        onClick={() => outdentItem(item.id)}
                        disabled={!canOutdent(items, item.id)}
                      >
                        <Outdent className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="size-7"
                        title="Add child"
                        onClick={() => addChildItem(item.id)}
                      >
                        <Plus className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="size-7"
                        title="Edit"
                        onClick={() => startEdit(item)}
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-muted-foreground hover:text-destructive size-7"
                        title="Delete"
                        onClick={() => removeItem(item.id)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </>
                )}
              </div>

              {hasChildren && (
                <CollapsibleContent>
                  <SortableContext items={item.children.map((c) => c.id)} strategy={verticalListSortingStrategy}>
                    {item.children.map((child) => renderItem(child, depth + 1))}
                  </SortableContext>
                </CollapsibleContent>
              )}
            </div>
          </Collapsible>
        )}
      </SortableTreeItem>
    );
  };

  // --- Bulk add (taxonomy only) ---

  const [bulkInput, setBulkInput] = React.useState("");
  const [bulkParent, setBulkParent] = React.useState("");

  const flattenForSelect = React.useCallback(
    (list: TreeItem[], depth = 0): Array<{ id: string; label: string }> =>
      list.flatMap((item) => [
        {
          id: item.id,
          label: `${"—".repeat(depth)}${depth > 0 ? " " : ""}${String(item.name || item.label || item.id)}`,
        },
        ...flattenForSelect(item.children, depth + 1),
      ]),
    [],
  );

  const parentOptions = React.useMemo(
    () => [{ id: "", label: "Root" }, ...flattenForSelect(items)],
    [items, flattenForSelect],
  );

  const handleBulkAdd = () => {
    const names = bulkInput
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (names.length === 0) return;

    const newItems = names.map((n) => ({
      id: generateId(),
      name: n,
      slug: slugify(n),
      children: [] as TreeItem[],
    }));

    setItems((prev) => {
      const next = cloneItems(prev);
      if (!bulkParent) {
        next.push(...newItems);
      } else {
        const addToParent = (list: TreeItem[]): boolean => {
          for (const item of list) {
            if (item.id === bulkParent) {
              item.children.push(...newItems);
              return true;
            }
            if (addToParent(item.children)) return true;
          }
          return false;
        };
        if (!addToParent(next)) next.push(...newItems);
        setExpandedIds((prev) => new Set([...prev, bulkParent]));
      }
      return next;
    });
    setBulkInput("");
  };

  // --- Render ---

  const emptyLabel = variant === "menu" ? "No menu items." : "No terms.";
  const addLabel = variant === "menu" ? "Add menu item" : "Add term";

  return (
    <div className="space-y-2">
      <input ref={hiddenRef} type="hidden" name={name} value={serialized} />

      {label && (
        <div className="flex items-center justify-between">
          <label className="text-sm leading-none font-medium">{label}</label>
          {hasExpandableItems && (
            <button
              type="button"
              onClick={toggleExpandAll}
              className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs leading-none transition-colors"
            >
              {allExpanded ? (
                <>
                  <ChevronsDownUp className="size-3.5" />
                  Collapse all
                </>
              ) : (
                <>
                  <ChevronsUpDown className="size-3.5" />
                  Expand all
                </>
              )}
            </button>
          )}
        </div>
      )}

      {variant === "taxonomy" && (
        <div className="flex items-center gap-2">
          <Input
            value={bulkInput}
            onChange={(e) => setBulkInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleBulkAdd();
              }
            }}
            placeholder="e.g., Electronics, Clothing, Books"
            className="min-w-0 flex-1 text-sm"
          />
          <Select
            items={parentOptions.map((opt) => ({ value: opt.id, label: opt.label }))}
            value={bulkParent}
            onValueChange={(v) => setBulkParent(v ?? "")}
          >
            <SelectTrigger className="w-32 shrink-0 text-sm">
              <SelectValue placeholder="Root" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {parentOptions.map((opt) => (
                  <SelectItem key={opt.id} value={opt.id}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <Button type="button" variant="outline" size="lg" onClick={handleBulkAdd} disabled={!bulkInput.trim()}>
            Add
          </Button>
        </div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div className="rounded-lg border">
          {items.length > 0 ? (
            <SortableContext items={items.map((item) => item.id)} strategy={verticalListSortingStrategy}>
              {items.map((item) => renderItem(item, 0))}
            </SortableContext>
          ) : (
            <div className="text-muted-foreground py-8 text-center text-sm">{emptyLabel}</div>
          )}
        </div>
        <DragOverlay dropAnimation={null}>
          {activeItem && (
            <div
              className="bg-background flex items-center gap-1 rounded-md border py-1.5 pr-2 text-sm shadow-lg"
              style={{ paddingLeft: `${activeDepth * 1.5 + 0.25}rem` }}
            >
              <GripVertical className="text-muted-foreground/50 size-3.5" />
              <span className="size-6 shrink-0" />
              <span className="truncate font-medium">{getItemLabel(activeItem, variant)}</span>
              {variant === "menu" && (
                <span className="text-muted-foreground truncate text-xs">{getItemSublabel(activeItem, variant)}</span>
              )}
            </div>
          )}
        </DragOverlay>
      </DndContext>
      <Button type="button" variant="outline" size="sm" onClick={addRootItem}>
        <Plus className="size-4" />
        {addLabel}
      </Button>
    </div>
  );
}
