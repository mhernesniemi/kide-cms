"use client";

import * as React from "react";
import { ChevronRight, Indent, Outdent, Pencil, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/admin/ui/button";
import { Input } from "@/components/admin/ui/input";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/admin/ui/collapsible";

type MenuItem = {
  id: string;
  label: string;
  href: string;
  target?: string;
  children: MenuItem[];
};

type Props = {
  name: string;
  value?: string;
};

function generateId() {
  return "mi_" + Math.random().toString(36).slice(2, 9);
}

function parseItems(value?: string): MenuItem[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed;
  } catch {}
  return [];
}

function cloneItems(items: MenuItem[]): MenuItem[] {
  return JSON.parse(JSON.stringify(items));
}

export default function MenuItemsEditor({ name, value }: Props) {
  const [items, setItems] = React.useState<MenuItem[]>(() => parseItems(value));
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editLabel, setEditLabel] = React.useState("");
  const [editHref, setEditHref] = React.useState("");
  const [editTarget, setEditTarget] = React.useState("");
  const [expandedIds, setExpandedIds] = React.useState<Set<string>>(() => {
    const ids = new Set<string>();
    const collectIds = (items: MenuItem[]) => {
      for (const item of items) {
        if (item.children.length > 0) ids.add(item.id);
        collectIds(item.children);
      }
    };
    collectIds(parseItems(value));
    return ids;
  });

  const serialized = JSON.stringify(items);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const addRootItem = () => {
    const newItem: MenuItem = { id: generateId(), label: "New item", href: "/", children: [] };
    setItems((prev) => [...prev, newItem]);
  };

  const addChildItem = (parentId: string) => {
    const newItem: MenuItem = { id: generateId(), label: "New item", href: "/", children: [] };
    setItems((prev) => {
      const next = cloneItems(prev);
      const addToParent = (items: MenuItem[]): boolean => {
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
      // Auto-expand parent
      setExpandedIds((prev) => new Set([...prev, parentId]));
      return next;
    });
  };

  const removeItem = (id: string) => {
    setItems((prev) => {
      const next = cloneItems(prev);
      const remove = (items: MenuItem[]): MenuItem[] =>
        items.filter((item) => {
          if (item.id === id) return false;
          item.children = remove(item.children);
          return true;
        });
      return remove(next);
    });
    if (editingId === id) setEditingId(null);
  };

  const startEdit = (item: MenuItem) => {
    setEditingId(item.id);
    setEditLabel(item.label);
    setEditHref(item.href);
    setEditTarget(item.target ?? "");
  };

  const saveEdit = () => {
    if (!editingId) return;
    setItems((prev) => {
      const next = cloneItems(prev);
      const update = (items: MenuItem[]) => {
        for (const item of items) {
          if (item.id === editingId) {
            item.label = editLabel;
            item.href = editHref;
            item.target = editTarget || undefined;
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
      const doIndent = (items: MenuItem[]): boolean => {
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
      const doOutdent = (items: MenuItem[], parentItems: MenuItem[] | null): boolean => {
        for (let i = 0; i < items.length; i++) {
          if (items[i].id === id && parentItems) {
            const [item] = items.splice(i, 1);
            // Find parent in parentItems and insert after it
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

  const findItemDepth = (items: MenuItem[], id: string, depth = 0): number => {
    for (const item of items) {
      if (item.id === id) return depth;
      const found = findItemDepth(item.children, id, depth + 1);
      if (found >= 0) return found;
    }
    return -1;
  };

  const canIndent = (items: MenuItem[], id: string): boolean => {
    const check = (items: MenuItem[]): boolean => {
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

  const renderItem = (item: MenuItem, depth: number) => {
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
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <Input
                value={editLabel}
                onChange={(e) => setEditLabel(e.target.value)}
                placeholder="Label"
                className="h-7 flex-1 text-sm"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveEdit();
                  if (e.key === "Escape") setEditingId(null);
                }}
              />
              <Input
                value={editHref}
                onChange={(e) => setEditHref(e.target.value)}
                placeholder="/path"
                className="h-7 w-32 text-sm"
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveEdit();
                  if (e.key === "Escape") setEditingId(null);
                }}
              />
              <select
                value={editTarget}
                onChange={(e) => setEditTarget(e.target.value)}
                className="border-input bg-background h-7 rounded-md border px-2 text-sm"
              >
                <option value="">Same tab</option>
                <option value="_blank">New tab</option>
              </select>
              <Button variant="ghost" size="icon-sm" className="size-7" onClick={saveEdit}>
                <Plus className="size-3.5 rotate-45" />
              </Button>
              <Button variant="ghost" size="icon-sm" className="size-7" onClick={() => setEditingId(null)}>
                <X className="size-3.5" />
              </Button>
            </div>
          ) : (
            <>
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <span className="truncate font-medium">{item.label}</span>
                <span className="text-muted-foreground truncate text-xs">{item.href}</span>
                {item.target === "_blank" && <span className="text-muted-foreground text-xs">(new tab)</span>}
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

  return (
    <div className="space-y-2">
      <input type="hidden" name={name} value={serialized} />
      <div className="rounded-lg border">
        {items.length > 0 ? (
          items.map((item) => renderItem(item, 0))
        ) : (
          <div className="text-muted-foreground py-8 text-center text-sm">No menu items. Add one below.</div>
        )}
      </div>
      <Button type="button" variant="outline" size="sm" onClick={addRootItem}>
        <Plus className="size-4" />
        Add menu item
      </Button>
    </div>
  );
}
