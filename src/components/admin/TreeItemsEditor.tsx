"use client";

import * as React from "react";
import * as ReactDOM from "react-dom";
import { Check, ChevronRight, Indent, Outdent, Pencil, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/admin/ui/button";
import { Input } from "@/components/admin/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/admin/ui/select";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/admin/ui/collapsible";

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
  internalSearch,
  internalOpen,
  filteredLinkOptions,
  onSearchChange,
  onFocus,
  onClose,
  onSelect,
}: {
  editHref: string;
  internalSearch: string;
  internalOpen: boolean;
  filteredLinkOptions: LinkOptionGroup[];
  onSearchChange: (v: string) => void;
  onFocus: () => void;
  onClose: () => void;
  onSelect: (item: { id: string; label: string; href: string }) => void;
}) {
  const triggerRef = React.useRef<HTMLInputElement>(null);
  const dropdownRef = React.useRef<HTMLDivElement>(null);
  const [pos, setPos] = React.useState({ top: 0, left: 0, width: 0 });

  // Compute position from trigger input
  React.useEffect(() => {
    if (!internalOpen || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
  }, [internalOpen, internalSearch]);

  // Close on outside click
  React.useEffect(() => {
    if (!internalOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (dropdownRef.current?.contains(target)) return;
      onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [internalOpen, onClose]);

  // Find the selected item label to display
  const selectedLabel = React.useMemo(() => {
    if (!editHref) return "";
    for (const group of filteredLinkOptions) {
      const found = group.items.find((item) => item.href === editHref);
      if (found) return found.label;
    }
    return editHref;
  }, [editHref, filteredLinkOptions]);

  return (
    <div className="min-w-0 flex-[3]">
      <Input
        ref={triggerRef}
        value={editHref ? selectedLabel : internalSearch}
        onChange={(e) => onSearchChange(e.target.value)}
        onFocus={onFocus}
        placeholder="Search documents..."
        className="h-7 text-sm"
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
        }}
      />
      {internalOpen &&
        ReactDOM.createPortal(
          <div
            ref={dropdownRef}
            className="bg-popover text-popover-foreground fixed z-9999 max-h-60 overflow-y-auto rounded-md border shadow-md"
            style={{ top: pos.top, left: pos.left, width: Math.max(pos.width) }}
          >
            {filteredLinkOptions.length === 0 ? (
              <div className="text-muted-foreground p-3 text-center text-xs">No documents found</div>
            ) : (
              filteredLinkOptions.map((group) => (
                <div key={group.collection}>
                  <div className="text-muted-foreground bg-muted/50 sticky top-0 px-3 py-1.5 text-xs font-medium">
                    {group.label}
                  </div>
                  {group.items.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="hover:bg-accent flex w-full items-center px-3 py-1.5 text-left text-sm"
                      onClick={() => onSelect(item)}
                    >
                      <span className="truncate">{item.label}</span>
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}

export default function TreeItemsEditor({ name, value, variant, linkOptions = [] }: Props) {
  const [items, setItems] = React.useState<TreeItem[]>(() => parseItems(value));
  const [editingId, setEditingId] = React.useState<string | null>(null);

  // Menu edit fields
  const [editLabel, setEditLabel] = React.useState("");
  const [editHref, setEditHref] = React.useState("");
  const [editTarget, setEditTarget] = React.useState("");
  const [editLinkType, setEditLinkType] = React.useState<"external" | "internal">("internal");
  const [internalSearch, setInternalSearch] = React.useState("");
  const [internalOpen, setInternalOpen] = React.useState(false);

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
    setInternalSearch("");
    setEditName("");
    setEditSlug("");
    setEditAutoSlug(true);
  };

  const addRootItem = () => {
    const newItem = createBlankItem();
    setItems((prev) => [...prev, newItem]);
    startEditNewItem(newItem.id);
  };

  const addChildItem = (parentId: string) => {
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
      setInternalSearch("");
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

  // Filtered internal link options for combobox
  const filteredLinkOptions = React.useMemo(() => {
    const q = internalSearch.toLowerCase();
    if (!q) return linkOptions;
    return linkOptions
      .map((group) => ({
        ...group,
        items: group.items.filter(
          (item) => item.label.toLowerCase().includes(q) || item.href.toLowerCase().includes(q),
        ),
      }))
      .filter((group) => group.items.length > 0);
  }, [linkOptions, internalSearch]);

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
              if (newType === "external") {
                setInternalOpen(false);
              } else {
                setEditHref("");
                setInternalOpen(true);
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
              placeholder="/path or https://..."
              className="h-7 min-w-0 flex-[3] text-sm"
              onKeyDown={editKeyHandler}
            />
          ) : (
            <InternalLinkPicker
              editHref={editHref}
              internalSearch={internalSearch}
              internalOpen={internalOpen}
              filteredLinkOptions={filteredLinkOptions}
              onSearchChange={(v) => {
                setInternalSearch(v);
                setEditHref("");
                setInternalOpen(true);
              }}
              onFocus={() => setInternalOpen(true)}
              onClose={() => setInternalOpen(false)}
              onSelect={(item) => {
                setEditHref(item.href);
                if (!editLabel) setEditLabel(item.label);
                setInternalSearch("");
                setInternalOpen(false);
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

  const renderItem = (item: TreeItem, depth: number) => {
    const hasChildren = item.children.length > 0;
    const isExpanded = expandedIds.has(item.id);
    const isEditing = editingId === item.id;

    return (
      <Collapsible key={item.id} open={isExpanded}>
        <div
          className="hover:bg-accent/40 flex items-center gap-2 border-b py-1.5 pr-2 text-sm transition-colors"
          style={{ paddingLeft: `${depth * 1.5 + 0.5}rem` }}
        >
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
                <span className="text-muted-foreground truncate text-xs">{getItemSublabel(item, variant)}</span>
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
                <Button variant="ghost" size="icon-sm" className="size-7" title="Edit" onClick={() => startEdit(item)}>
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
          <CollapsibleContent>{item.children.map((child) => renderItem(child, depth + 1))}</CollapsibleContent>
        )}
      </Collapsible>
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

      <div className="rounded-lg border">
        {items.length > 0 ? (
          items.map((item) => renderItem(item, 0))
        ) : (
          <div className="text-muted-foreground py-8 text-center text-sm">{emptyLabel}</div>
        )}
      </div>
      <Button type="button" variant="outline" size="sm" onClick={addRootItem}>
        <Plus className="size-4" />
        {addLabel}
      </Button>
    </div>
  );
}
