"use client";

import * as React from "react";
import { ChevronRight, FolderTree, Pencil, Plus, Trash2, ChevronsDownUp, ChevronsUpDown } from "lucide-react";
import { Badge } from "@/components/admin/ui/badge";
import { Button } from "@/components/admin/ui/button";
import { Input } from "@/components/admin/ui/input";
import { Label } from "@/components/admin/ui/label";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/admin/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/admin/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogClose,
} from "@/components/admin/ui/alert-dialog";

type CategoryData = {
  id: string;
  name: string;
  slug: string;
  parent: string | null;
  position: number;
  locales: string[];
};

type CategoryNode = CategoryData & {
  children: CategoryNode[];
};

type Props = {
  collectionSlug: string;
  categories: CategoryData[];
  locales: string[];
  defaultLocale: string;
};

const STORAGE_KEY = "admin:categories:expanded";

function loadExpandedIds(): Set<string> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return new Set(JSON.parse(stored));
  } catch {}
  return new Set();
}

function saveExpandedIds(ids: Set<string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
  } catch {}
}

function buildTree(categories: CategoryData[]): CategoryNode[] {
  const map = new Map<string, CategoryNode>();
  const roots: CategoryNode[] = [];

  for (const cat of categories) {
    map.set(cat.id, { ...cat, children: [] });
  }

  for (const cat of categories) {
    const node = map.get(cat.id)!;
    if (cat.parent && map.has(cat.parent)) {
      map.get(cat.parent)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const sortChildren = (nodes: CategoryNode[]) => {
    nodes.sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
    nodes.forEach((n) => sortChildren(n.children));
  };
  sortChildren(roots);

  return roots;
}

function flattenTree(nodes: CategoryNode[], depth = 0): Array<{ id: string; name: string; depth: number }> {
  return nodes.flatMap((node) => [{ id: node.id, name: node.name, depth }, ...flattenTree(node.children, depth + 1)]);
}

function countDescendants(node: CategoryNode): number {
  return node.children.reduce((sum, child) => sum + 1 + countDescendants(child), 0);
}

function hasNestedChildren(nodes: CategoryNode[]): boolean {
  return nodes.some((n) => n.children.length > 0);
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

export default function CategoryTree({ collectionSlug, categories }: Props) {
  const tree = React.useMemo(() => buildTree(categories), [categories]);
  const flatList = React.useMemo(() => flattenTree(tree), [tree]);
  const [expandedIds, setExpandedIds] = React.useState<Set<string>>(() => loadExpandedIds());
  const [isPending, setIsPending] = React.useState(false);

  // Dialog state
  const [createDialogOpen, setCreateDialogOpen] = React.useState(false);
  const [editDialogOpen, setEditDialogOpen] = React.useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [dialogParentId, setDialogParentId] = React.useState<string | null>(null);
  const [editingCategory, setEditingCategory] = React.useState<CategoryData | null>(null);
  const [deletingNode, setDeletingNode] = React.useState<CategoryNode | null>(null);

  // Form fields
  const [formName, setFormName] = React.useState("");
  const [formSlug, setFormSlug] = React.useState("");
  const [formParent, setFormParent] = React.useState<string | null>(null);
  const [autoSlug, setAutoSlug] = React.useState(true);

  // Quick-add
  const [quickAddNames, setQuickAddNames] = React.useState("");
  const [quickAddParent, setQuickAddParent] = React.useState<string | null>(null);

  const toggleExpand = React.useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      saveExpandedIds(next);
      return next;
    });
  }, []);

  const expandAll = React.useCallback(() => {
    const allIds = new Set(categories.filter((c) => categories.some((ch) => ch.parent === c.id)).map((c) => c.id));
    setExpandedIds(allIds);
    saveExpandedIds(allIds);
  }, [categories]);

  const collapseAll = React.useCallback(() => {
    setExpandedIds(new Set());
    saveExpandedIds(new Set());
  }, []);

  const reloadWithToast = (status: string, msg: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set("_toast", status);
    url.searchParams.set("_msg", msg);
    window.location.assign(url.pathname + url.search);
  };

  const openCreateDialog = (parentId: string | null = null) => {
    setFormName("");
    setFormSlug("");
    setFormParent(parentId);
    setAutoSlug(true);
    setDialogParentId(parentId);
    setCreateDialogOpen(true);
  };

  const openEditDialog = (cat: CategoryData) => {
    setEditingCategory(cat);
    setFormName(cat.name);
    setFormSlug(cat.slug);
    setFormParent(cat.parent);
    setAutoSlug(false);
    setEditDialogOpen(true);
  };

  const openDeleteDialog = (node: CategoryNode) => {
    setDeletingNode(node);
    setDeleteDialogOpen(true);
  };

  const handleCreate = async () => {
    if (!formName.trim()) return;
    setIsPending(true);
    try {
      const res = await fetch(`/api/cms/${collectionSlug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formName.trim(),
          slug: formSlug || slugify(formName),
          parent: formParent || undefined,
          position: 0,
        }),
      });
      if (!res.ok) throw new Error("Failed to create category");
      setCreateDialogOpen(false);
      reloadWithToast("success", `Created "${formName.trim()}"`);
    } catch (e) {
      reloadWithToast("error", e instanceof Error ? e.message : "Failed to create");
    }
  };

  const handleUpdate = async () => {
    if (!editingCategory || !formName.trim()) return;
    setIsPending(true);
    try {
      const res = await fetch(`/api/cms/${collectionSlug}/${editingCategory.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formName.trim(),
          slug: formSlug || slugify(formName),
          parent: formParent || null,
        }),
      });
      if (!res.ok) throw new Error("Failed to update category");
      setEditDialogOpen(false);
      reloadWithToast("success", `Updated "${formName.trim()}"`);
    } catch (e) {
      reloadWithToast("error", e instanceof Error ? e.message : "Failed to update");
    }
  };

  const handleDelete = async () => {
    if (!deletingNode) return;
    setIsPending(true);
    try {
      const res = await fetch(`/api/cms/${collectionSlug}/${deletingNode.id}`, {
        method: "DELETE",
        headers: { Accept: "application/json" },
      });
      if (!res.ok) throw new Error("Failed to delete category");
      setDeleteDialogOpen(false);
      reloadWithToast("success", `Deleted "${deletingNode.name}"`);
    } catch (e) {
      reloadWithToast("error", e instanceof Error ? e.message : "Failed to delete");
    }
  };

  const handleQuickAdd = async () => {
    const names = quickAddNames
      .split(",")
      .map((n) => n.trim())
      .filter(Boolean);
    if (names.length === 0) return;
    setIsPending(true);
    try {
      for (const name of names) {
        const res = await fetch(`/api/cms/${collectionSlug}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            slug: slugify(name),
            parent: quickAddParent || undefined,
            position: 0,
          }),
        });
        if (!res.ok) throw new Error(`Failed to create "${name}"`);
      }
      reloadWithToast("success", `Created ${names.length} ${names.length === 1 ? "category" : "categories"}`);
    } catch (e) {
      reloadWithToast("error", e instanceof Error ? e.message : "Failed to create");
    }
  };

  const renderNode = (node: CategoryNode, depth: number, parentPath: string) => {
    const isExpanded = expandedIds.has(node.id);
    const hasChildren = node.children.length > 0;
    const fullPath = parentPath ? `${parentPath}/${node.slug}` : node.slug;

    return (
      <Collapsible key={node.id} open={isExpanded}>
        <div
          className="hover:bg-accent/40 flex items-center gap-2 border-b py-2 pr-2 transition-colors"
          style={{ paddingLeft: `${depth * 1.5 + 0.5}rem` }}
        >
          {hasChildren ? (
            <CollapsibleTrigger
              onClick={() => toggleExpand(node.id)}
              className="text-muted-foreground hover:text-foreground flex size-6 shrink-0 items-center justify-center rounded-md transition-colors"
            >
              <ChevronRight
                className="size-4 transition-transform duration-150"
                style={{ transform: isExpanded ? "rotate(90deg)" : undefined }}
              />
            </CollapsibleTrigger>
          ) : (
            <span className="size-6 shrink-0" />
          )}

          <div className="flex min-w-0 flex-1 items-center gap-3">
            <span className="truncate font-medium">{node.name}</span>
            <span className="text-muted-foreground truncate text-sm">{fullPath}</span>
            <div className="flex gap-1">
              {node.locales.map((locale) => (
                <Badge key={locale} variant="outline" className="text-xs">
                  {locale}
                </Badge>
              ))}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              className="size-7"
              title="Add child"
              onClick={() => openCreateDialog(node.id)}
              disabled={isPending}
            >
              <Plus className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              className="size-7"
              title="Edit"
              onClick={() => openEditDialog(node)}
              disabled={isPending}
            >
              <Pencil className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-destructive hover:text-destructive size-7"
              title="Delete"
              onClick={() => openDeleteDialog(node)}
              disabled={isPending}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        </div>

        {hasChildren && (
          <CollapsibleContent>
            {node.children.map((child) => renderNode(child, depth + 1, fullPath))}
          </CollapsibleContent>
        )}
      </Collapsible>
    );
  };

  const descendantCount = deletingNode ? countDescendants(deletingNode) : 0;

  return (
    <div className="space-y-4">
      {/* Quick-add form */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1">
          <Label htmlFor="quick-add-names" className="mb-1.5 block text-sm">
            Quick add
          </Label>
          <Input
            id="quick-add-names"
            value={quickAddNames}
            onChange={(e) => setQuickAddNames(e.target.value)}
            placeholder="Comma-separated names, e.g. Shoes, Bags, Hats"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void handleQuickAdd();
              }
            }}
          />
        </div>
        <div className="w-48">
          <Label htmlFor="quick-add-parent" className="mb-1.5 block text-sm">
            Parent
          </Label>
          <select
            id="quick-add-parent"
            className="border-input bg-background ring-offset-background focus:ring-ring flex h-9 w-full rounded-md border px-3 py-1 text-sm focus:ring-2 focus:ring-offset-2 focus:outline-none"
            value={quickAddParent ?? ""}
            onChange={(e) => setQuickAddParent(e.target.value || null)}
          >
            <option value="">Root level</option>
            {flatList.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {"— ".repeat(cat.depth)}
                {cat.name}
              </option>
            ))}
          </select>
        </div>
        <Button size="sm" onClick={handleQuickAdd} disabled={isPending || !quickAddNames.trim()}>
          <Plus className="size-4" />
          Add
        </Button>
      </div>

      {/* Tree header */}
      <div className="flex items-center justify-between">
        <div className="text-muted-foreground text-sm">{categories.length} categories</div>
        <div className="flex items-center gap-2">
          {hasNestedChildren(tree) && (
            <Button variant="ghost" size="sm" onClick={expandedIds.size > 0 ? collapseAll : expandAll}>
              {expandedIds.size > 0 ? (
                <>
                  <ChevronsDownUp className="size-4" />
                  Collapse all
                </>
              ) : (
                <>
                  <ChevronsUpDown className="size-4" />
                  Expand all
                </>
              )}
            </Button>
          )}
          <Button size="sm" onClick={() => openCreateDialog(null)}>
            <Plus className="size-4" />
            New category
          </Button>
        </div>
      </div>

      {/* Tree */}
      <div className="rounded-lg border">
        {tree.length > 0 ? (
          tree.map((node) => renderNode(node, 0, ""))
        ) : (
          <div className="text-muted-foreground flex flex-col items-center gap-2 py-12 text-center text-sm">
            <FolderTree className="text-muted-foreground/50 size-10" />
            No categories yet. Create one above.
          </div>
        )}
      </div>

      {/* Create dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New category</DialogTitle>
            <DialogDescription>
              {dialogParentId
                ? `Create a child of "${categories.find((c) => c.id === dialogParentId)?.name ?? ""}"`
                : "Create a root-level category"}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="create-name">Name *</Label>
              <Input
                id="create-name"
                value={formName}
                onChange={(e) => {
                  setFormName(e.target.value);
                  if (autoSlug) setFormSlug(slugify(e.target.value));
                }}
                placeholder="Category name"
                autoFocus
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="create-slug">Slug</Label>
              <Input
                id="create-slug"
                value={formSlug}
                onChange={(e) => {
                  setFormSlug(e.target.value);
                  setAutoSlug(false);
                }}
                placeholder="auto-generated"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="create-parent">Parent</Label>
              <select
                id="create-parent"
                className="border-input bg-background ring-offset-background focus:ring-ring flex h-9 w-full rounded-md border px-3 py-1 text-sm focus:ring-2 focus:ring-offset-2 focus:outline-none"
                value={formParent ?? ""}
                onChange={(e) => setFormParent(e.target.value || null)}
              >
                <option value="">None (root level)</option>
                {flatList.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {"— ".repeat(cat.depth)}
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <DialogFooter>
            <DialogClose>
              <Button variant="outline" disabled={isPending}>
                Cancel
              </Button>
            </DialogClose>
            <Button onClick={handleCreate} disabled={isPending || !formName.trim()}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit category</DialogTitle>
            <DialogDescription>Update "{editingCategory?.name}"</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="edit-name">Name *</Label>
              <Input id="edit-name" value={formName} onChange={(e) => setFormName(e.target.value)} autoFocus />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-slug">Slug</Label>
              <Input id="edit-slug" value={formSlug} onChange={(e) => setFormSlug(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-parent">Parent</Label>
              <select
                id="edit-parent"
                className="border-input bg-background ring-offset-background focus:ring-ring flex h-9 w-full rounded-md border px-3 py-1 text-sm focus:ring-2 focus:ring-offset-2 focus:outline-none"
                value={formParent ?? ""}
                onChange={(e) => setFormParent(e.target.value || null)}
              >
                <option value="">None (root level)</option>
                {flatList
                  .filter((cat) => cat.id !== editingCategory?.id)
                  .map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {"— ".repeat(cat.depth)}
                      {cat.name}
                    </option>
                  ))}
              </select>
            </div>
          </div>
          <DialogFooter>
            <DialogClose>
              <Button variant="outline" disabled={isPending}>
                Cancel
              </Button>
            </DialogClose>
            <Button onClick={handleUpdate} disabled={isPending || !formName.trim()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deletingNode?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              {descendantCount > 0
                ? `This will also delete ${descendantCount} child ${descendantCount === 1 ? "category" : "categories"}. This action cannot be undone.`
                : "This action cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose>
              <Button variant="outline" disabled={isPending}>
                Cancel
              </Button>
            </AlertDialogClose>
            <Button variant="destructive" onClick={handleDelete} disabled={isPending}>
              Delete
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
