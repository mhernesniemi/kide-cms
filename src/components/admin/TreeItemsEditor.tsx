"use client";

import * as React from "react";
import {
  Check,
  ChevronRight,
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
import { Button } from "@/components/admin/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/admin/ui/command";
import { Input } from "@/components/admin/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/admin/ui/popover";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/admin/ui/select";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/admin/ui/collapsible";
import { cn } from "@/lib/utils";

type TreeItem = {
  id: string;
  children: TreeItem[];
  [key: string]: unknown;
};

type LinkOptionGroup = {
  collection: string;
  label: string;
  items: Array<{ id: string; label: string; href: string }>;
};

type Props = {
  name: string;
  value?: string;
  variant: "menu" | "taxonomy";
  linkOptions?: LinkOptionGroup[];
};

function generateId() {
  return "ti_" + Math.random().toString(36).slice(2, 9);
}

function slugify(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseItems(value?: string): TreeItem[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed;
  } catch {}
  return [];
}

function cloneItems(items: TreeItem[]): TreeItem[] {
  return JSON.parse(JSON.stringify(items));
}

function createBlankItem(): TreeItem {
  return { id: generateId(), children: [] };
}

function getItemLabel(item: TreeItem, variant: "menu" | "taxonomy"): string {
  return String(variant === "menu" ? item.label : item.name) || "—";
}

function getItemSublabel(item: TreeItem, variant: "menu" | "taxonomy"): string {
  return String(variant === "menu" ? item.href : item.slug) || "";
}

function InternalLinkPicker({
  editHref,
  linkOptions,
  onSelect,
}: {
  editHref: string;
  linkOptions: LinkOptionGroup[];
  onSelect: (item: { id: string; label: string; href: string }) => void;
}) {
  const [open, setOpen] = React.useState(false);

  const selectedLabel = React.useMemo(() => {
    if (!editHref) return "";
    for (const group of linkOptions) {
      const found = group.items.find((item) => item.href === editHref);
      if (found) return found.label;
    }
    return editHref;
  }, [editHref, linkOptions]);

  return (
    <div className="min-w-0 flex-[3]">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="h-7 w-full justify-between font-normal"
          >
            <span className={cn("truncate", !selectedLabel && "text-muted-foreground")}>
              {selectedLabel || "Search documents..."}
            </span>
            <ChevronsUpDown className="ml-2 size-3.5 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
          <Command>
            <CommandInput placeholder="Search documents..." />
            <CommandList>
              <CommandEmpty>No documents found.</CommandEmpty>
              {linkOptions.map((group) => (
                <CommandGroup key={group.collection} heading={group.label}>
                  {group.items.map((item) => (
                    <CommandItem
                      key={item.id}
                      value={`${item.label} ${item.href}`}
                      onSelect={() => {
                        onSelect(item);
                        setOpen(false);
                      }}
                    >
                      <Check className={cn("size-4", editHref === item.href ? "opacity-100" : "opacity-0")} />
                      {item.label}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

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

function findItemById(items: TreeItem[], id: string): TreeItem | null {
  for (const item of items) {
    if (item.id === id) return item;
    const found = findItemById(item.children, id);
    if (found) return found;
  }
  return null;
}

function findParentList(items: TreeItem[], id: string): TreeItem[] | null {
  for (const item of items) {
    if (item.id === id) return items;
    const found = findParentList(item.children, id);
    if (found) return found;
  }
  return null;
}

export default function TreeItemsEditor({ name, value, variant, linkOptions = [] }: Props) {
  const [items, setItems] = React.useState<TreeItem[]>(() => parseItems(value));
  const [editingId, setEditingId] = React.useState<string | null>(null);

  // Menu edit fields
  const [editLabel, setEditLabel] = React.useState("");
  const [editHref, setEditHref] = React.useState("");
  const [editTarget, setEditTarget] = React.useState("");
  const [editLinkType, setEditLinkType] = React.useState<"external" | "internal">("internal");

  // Taxonomy edit fields
  const [editName, setEditName] = React.useState("");
  const [editSlug, setEditSlug] = React.useState("");
  const [editAutoSlug, setEditAutoSlug] = React.useState(true);
  const newItemIds = React.useRef(new Set<string>());
  const hiddenRef = React.useRef<HTMLInputElement>(null);

  const [expandedIds, setExpandedIds] = React.useState<Set<string>>(() => {
    const ids = new Set<string>();
    const collectIds = (items: TreeItem[]) => {
      for (const item of items) {
        if (item.children.length > 0) ids.add(item.id);
        collectIds(item.children);
      }
    };
    collectIds(parseItems(value));
    return ids;
  });

  // Compute serialized value that includes any pending inline edit
  const serialized = React.useMemo(() => {
    if (!editingId) return JSON.stringify(items);
    const merged = cloneItems(items);
    const apply = (list: TreeItem[]) => {
      for (const item of list) {
        if (item.id === editingId) {
          if (variant === "menu") {
            item.label = editLabel;
            item.href = editHref;
            item.target = editTarget || undefined;
          } else {
            item.name = editName;
            item.slug = editSlug || slugify(editName);
          }
          return;
        }
        apply(item.children);
      }
    };
    apply(merged);
    return JSON.stringify(merged);
  }, [items, editingId, variant, editLabel, editHref, editTarget, editName, editSlug]);

  // Notify form of changes so UnsavedGuard can detect them
  React.useEffect(() => {
    hiddenRef.current?.dispatchEvent(new Event("change", { bubbles: true }));
  }, [serialized]);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const startEditNewItem = (id: string) => {
    newItemIds.current.add(id);
    setEditingId(id);
    setEditLabel("");
    setEditHref("");
    setEditTarget("");
    setEditLinkType("internal");
    setEditName("");
    setEditSlug("");
    setEditAutoSlug(true);
  };

  const saveOrDiscardEdit = () => {
    if (!editingId) return;
    const isEmpty = variant === "menu" ? !editLabel.trim() && !editHref.trim() : !editName.trim();
    if (isEmpty) {
      removeItem(editingId);
      newItemIds.current.delete(editingId);
      setEditingId(null);
    } else {
      saveEdit();
    }
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
      const addToParent = (items: TreeItem[]): boolean => {
        for (const item of items) {
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

  const removeItem = (id: string) => {
    setItems((prev) => {
      const next = cloneItems(prev);
      const remove = (items: TreeItem[]): TreeItem[] =>
        items.filter((item) => {
          if (item.id === id) return false;
          item.children = remove(item.children);
          return true;
        });
      return remove(next);
    });
    if (editingId === id) setEditingId(null);
  };

  const startEdit = (item: TreeItem) => {
    setEditingId(item.id);
    if (variant === "menu") {
      setEditLabel(String(item.label ?? ""));
      setEditHref(String(item.href ?? ""));
      setEditTarget(String(item.target ?? ""));
      // Detect link type from existing href
      const isInternal = linkOptions.some((group) => group.items.some((li) => li.href === String(item.href ?? "")));
      setEditLinkType(isInternal ? "internal" : "external");
    } else {
      setEditName(String(item.name ?? ""));
      setEditSlug(String(item.slug ?? ""));
      setEditAutoSlug(false);
    }
  };

  const cancelEdit = () => {
    if (editingId && newItemIds.current.has(editingId)) {
      removeItem(editingId);
      newItemIds.current.delete(editingId);
    }
    setEditingId(null);
  };

  const saveEdit = () => {
    if (!editingId) return;
    newItemIds.current.delete(editingId);
    setItems((prev) => {
      const next = cloneItems(prev);
      const update = (items: TreeItem[]) => {
        for (const item of items) {
          if (item.id === editingId) {
            if (variant === "menu") {
              item.label = editLabel;
              item.href = editHref;
              item.target = editTarget || undefined;
            } else {
              item.name = editName;
              item.slug = editSlug || slugify(editName);
              if (item.description !== undefined || false) {
                // preserve existing description
              }
            }
            return;
          }
          update(item.children);
        }
      };
      update(next);
      return next;
    });
    setEditingId(null);
  };

  const indentItem = (id: string) => {
    setItems((prev) => {
      const next = cloneItems(prev);
      const doIndent = (items: TreeItem[]): boolean => {
        for (let i = 0; i < items.length; i++) {
          if (items[i].id === id && i > 0) {
            const [item] = items.splice(i, 1);
            items[i - 1].children.push(item);
            setExpandedIds((prev) => new Set([...prev, items[i - 1].id]));
            return true;
          }
          if (doIndent(items[i].children)) return true;
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
      const doOutdent = (items: TreeItem[], parentItems: TreeItem[] | null): boolean => {
        for (let i = 0; i < items.length; i++) {
          if (items[i].id === id && parentItems) {
            const [item] = items.splice(i, 1);
            const parentIdx = parentItems.findIndex((p) => p.children === items);
            if (parentIdx >= 0) {
              parentItems.splice(parentIdx + 1, 0, item);
              return true;
            }
          }
          if (doOutdent(items[i].children, items)) return true;
        }
        return false;
      };
      doOutdent(next, null);
      return next;
    });
  };

  const findItemDepth = (items: TreeItem[], id: string, depth = 0): number => {
    for (const item of items) {
      if (item.id === id) return depth;
      const found = findItemDepth(item.children, id, depth + 1);
      if (found >= 0) return found;
    }
    return -1;
  };

  const canIndent = (items: TreeItem[], id: string): boolean => {
    const check = (items: TreeItem[]): boolean => {
      for (let i = 0; i < items.length; i++) {
        if (items[i].id === id) return i > 0;
        if (check(items[i].children)) return true;
      }
      return false;
    };
    return check(items);
  };

  const canOutdent = (id: string): boolean => {
    return findItemDepth(items, id) > 0;
  };

  const editKeyHandler = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") saveEdit();
    if (e.key === "Escape") cancelEdit();
  };

  const renderEditFields = () => {
    if (variant === "menu") {
      return (
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {/* Label — 50% */}
          <Input
            value={editLabel}
            onChange={(e) => setEditLabel(e.target.value)}
            placeholder="Label"
            className="h-7 min-w-0 flex-[3] text-sm"
            autoFocus
            onKeyDown={editKeyHandler}
          />
          {/* Link type — 25% */}
          <Select
            items={[
              { value: "external", label: "External link" },
              { value: "internal", label: "Internal link" },
            ]}
            value={editLinkType}
            onValueChange={(v) => {
              const newType = (v as "external" | "internal") ?? "external";
              setEditLinkType(newType);
              if (newType === "internal") {
                setEditHref("");
              }
            }}
          >
            <SelectTrigger className="!h-7 min-w-0 flex-[2] text-sm">
              <SelectValue placeholder="Link type" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="external">External link</SelectItem>
                <SelectItem value="internal">Internal link</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
          {/* URL / Internal picker — 25% */}
          {editLinkType === "external" ? (
            <Input
              value={editHref}
              onChange={(e) => setEditHref(e.target.value)}
              placeholder="https://..."
              className="h-7 min-w-0 flex-[3] text-sm"
              onKeyDown={editKeyHandler}
            />
          ) : (
            <InternalLinkPicker
              editHref={editHref}
              linkOptions={linkOptions}
              onSelect={(item) => {
                setEditHref(item.href);
                if (!editLabel) setEditLabel(item.label);
              }}
            />
          )}
        </div>
      );
    }
    return (
      <>
        <Input
          value={editName}
          onChange={(e) => {
            setEditName(e.target.value);
            if (editAutoSlug) setEditSlug(slugify(e.target.value));
          }}
          placeholder="Name"
          className="h-7 flex-1 text-sm"
          autoFocus
          onKeyDown={editKeyHandler}
        />
        <Input
          value={editSlug}
          onChange={(e) => {
            setEditSlug(e.target.value);
            setEditAutoSlug(false);
          }}
          placeholder="slug"
          className="h-7 w-36 text-sm"
          onKeyDown={editKeyHandler}
        />
      </>
    );
  };

  const [activeId, setActiveId] = React.useState<string | null>(null);

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
      // Only allow reorder within the same parent level
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

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // Check if an item is an ancestor of the currently dragged item
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

  // IDs of items that are siblings of the active dragged item — collapse their children during drag
  const activeSiblingIds = React.useMemo(() => {
    if (!activeId) return null;
    const parentList = findParentList(items, activeId);
    if (!parentList) return null;
    return new Set(parentList.map((item) => item.id));
  }, [activeId, items]);

  const renderItem = (item: TreeItem, depth: number) => {
    const hasChildren = item.children.length > 0;
    // Collapse all siblings of the dragged item during drag for uniform height
    const isDragSibling = activeSiblingIds?.has(item.id) ?? false;
    const isExpanded = expandedIds.has(item.id) && !isDragSibling;
    const isEditing = editingId === item.id;
    // Disable sorting on this item if one of its descendants is being dragged
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
                {/* Drag handle */}
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
                  <>
                    {variant === "menu" ? (
                      <>
                        {renderEditFields()}
                        <div className="flex shrink-0 items-center gap-0.5">
                          <Button variant="ghost" size="icon-sm" className="size-7" onClick={saveEdit} title="Save">
                            <Check className="size-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon-sm" className="size-7" onClick={cancelEdit} title="Cancel">
                            <X className="size-3.5" />
                          </Button>
                        </div>
                      </>
                    ) : (
                      <div className="flex min-w-0 flex-1 items-center gap-2">
                        {renderEditFields()}
                        <Button variant="ghost" size="icon-sm" className="size-7" onClick={saveEdit} title="Save">
                          <Check className="size-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon-sm" className="size-7" onClick={cancelEdit} title="Cancel">
                          <X className="size-3.5" />
                        </Button>
                      </div>
                    )}
                  </>
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
                        disabled={!canOutdent(item.id)}
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
                        className="text-destructive hover:text-destructive size-7"
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

  // Bulk-add for taxonomy variant
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

  const emptyLabel = variant === "menu" ? "No menu items." : "No terms.";
  const addLabel = variant === "menu" ? "Add menu item" : "Add term";

  return (
    <div className="space-y-2">
      <input ref={hiddenRef} type="hidden" name={name} value={serialized} />

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
