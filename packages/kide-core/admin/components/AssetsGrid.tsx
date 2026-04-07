"use client";

import { useState, useCallback, useRef } from "react";
import {
  ChevronRight,
  Folder,
  FolderPlus,
  GripVertical,
  ImagePlus,
  MoreHorizontal,
  Pencil,
  Trash2,
  Upload,
} from "lucide-react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { cn } from "../lib/utils";
import { Badge } from "./ui/badge";
import { Button, buttonVariants } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
  DialogClose,
} from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

type AssetItem = {
  _id: string;
  filename: string;
  mimeType: string;
  url: string;
  alt: string | null;
  _createdAt: string;
};

type FolderItem = {
  _id: string;
  name: string;
};

type Breadcrumb = {
  label: string;
  href: string;
  id: string;
};

type Props = {
  folders: FolderItem[];
  assets: AssetItem[];
  breadcrumbs: Breadcrumb[];
  currentFolderId: string | null;
};

// -----------------------------------------------
// Draggable asset card
// -----------------------------------------------

function DraggableAssetCard({
  asset,
  selected,
  onToggleSelect,
}: {
  asset: AssetItem;
  selected: boolean;
  onToggleSelect: () => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } = useDraggable({
    id: asset._id,
    data: { type: "asset", asset },
  });

  return (
    <div ref={setNodeRef} className={cn("group relative", isDragging && "opacity-40")}>
      <a href={`/admin/assets/${asset._id}`} className="block">
        <Card className="hover:border-foreground/50 overflow-hidden pt-0 transition-colors">
          <div className="relative">
            {asset.mimeType.startsWith("image/") ? (
              <div className="bg-muted/30 aspect-square w-full overflow-hidden">
                <img src={asset.url} alt={asset.alt ?? asset.filename} className="size-full object-cover" />
              </div>
            ) : (
              <div className="bg-muted/30 flex aspect-square items-center justify-center">
                <Badge variant="outline">{asset.mimeType}</Badge>
              </div>
            )}
          </div>
          <CardContent className="px-3">
            <div className="truncate text-sm font-medium">{asset.filename}</div>
            <div className="text-muted-foreground mt-0.5 text-xs">
              {new Date(asset._createdAt).toLocaleDateString()}
            </div>
          </CardContent>
        </Card>
      </a>
      {/* Checkbox */}
      <label
        className={cn(
          "border-foreground/40 hover:border-foreground/80 bg-background/80 absolute top-2.5 right-2.5 z-10 flex size-5 cursor-default items-center justify-center rounded border backdrop-blur-sm transition-[opacity,border-color]",
          selected ? "border-foreground! opacity-100" : "opacity-0 group-hover:opacity-100",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <input
          type="checkbox"
          className="peer sr-only"
          checked={selected}
          onChange={(e) => {
            e.stopPropagation();
            onToggleSelect();
          }}
        />
        <svg
          className={cn("text-foreground size-3", selected ? "block" : "hidden")}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </label>
      {/* Drag handle */}
      <div
        ref={setActivatorNodeRef}
        className="bg-background/80 border-foreground/40 hover:border-foreground/80 text-muted-foreground absolute top-2.5 left-2.5 z-10 flex size-5 cursor-grab items-center justify-center rounded border opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100 active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="text-foreground size-3.5" />
      </div>
    </div>
  );
}

// -----------------------------------------------
// Droppable folder card
// -----------------------------------------------

function DroppableFolder({
  folder,
  onOpenMenu,
  menuActive,
}: {
  folder: FolderItem;
  onOpenMenu: (folderId: string, folderName: string, rect: DOMRect) => void;
  menuActive?: boolean;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: `folder-${folder._id}`,
    data: { type: "folder", folderId: folder._id },
  });

  return (
    <div ref={setNodeRef} className="group relative">
      <a href={`/admin/assets?folder=${folder._id}`}>
        <Card
          className={cn(
            "transition-shadow",
            isOver ? "ring-foreground/40 bg-primary/8 ring-1" : "hover:ring-foreground/20 hover:ring-1",
          )}
        >
          <CardContent className="flex items-center gap-3 py-3">
            <Folder className="text-muted-foreground size-5" />
            <span className="truncate text-sm font-medium">{folder.name}</span>
          </CardContent>
        </Card>
      </a>
      <div
        className={cn(
          "absolute top-1/2 right-3 -translate-y-1/2 transition-opacity",
          menuActive ? "opacity-100" : "opacity-0 group-hover:opacity-100",
        )}
      >
        <button
          type="button"
          title="Folder options"
          className="text-muted-foreground hover:text-foreground rounded-md p-1"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const rect = e.currentTarget.getBoundingClientRect();
            onOpenMenu(folder._id, folder.name, rect);
          }}
        >
          <MoreHorizontal className="size-4" />
        </button>
      </div>
    </div>
  );
}

// -----------------------------------------------
// Droppable breadcrumb
// -----------------------------------------------

function DroppableBreadcrumb({ href, folderId, label }: { href: string; folderId: string; label: string }) {
  const { isOver, setNodeRef } = useDroppable({
    id: `breadcrumb-${folderId}`,
    data: { type: "folder", folderId: folderId || null },
  });

  return (
    <a
      ref={setNodeRef}
      href={href}
      className={cn(
        "bg-muted/50 border-border hover:border-foreground/20 hover:text-foreground rounded-md border px-2.5 py-1 transition-colors",
        isOver && "border-primary! bg-primary/12! text-foreground",
      )}
    >
      {label}
    </a>
  );
}

// -----------------------------------------------
// Drag overlay (ghost while dragging)
// -----------------------------------------------

function AssetDragOverlay({ asset }: { asset: AssetItem }) {
  return (
    <div className="w-48" style={{ transform: "rotate(2deg) scale(0.95)" }}>
      <Card className="overflow-hidden pt-0 shadow-lg">
        <div className="relative">
          {asset.mimeType.startsWith("image/") ? (
            <div className="bg-muted/30 aspect-square w-full overflow-hidden">
              <img src={asset.url} alt={asset.alt ?? asset.filename} className="size-full object-cover" />
            </div>
          ) : (
            <div className="bg-muted/30 flex aspect-square items-center justify-center">
              <Badge variant="outline">{asset.mimeType}</Badge>
            </div>
          )}
        </div>
        <CardContent className="px-3">
          <div className="truncate text-sm font-medium">{asset.filename}</div>
        </CardContent>
      </Card>
    </div>
  );
}

// -----------------------------------------------
// Main component
// -----------------------------------------------

export default function AssetsGrid({ folders, assets, breadcrumbs, currentFolderId }: Props) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeAsset, setActiveAsset] = useState<AssetItem | null>(null);

  // Folder dialog state
  const [createOpen, setCreateOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [renameName, setRenameName] = useState("");
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [activeFolderName, setActiveFolderName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Context menu
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });

  const uploadFormRef = useRef<HTMLFormElement>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // --- Selection ---

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  // --- Drag & drop ---

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const asset = assets.find((a) => a._id === event.active.id);
      if (asset) setActiveAsset(asset);
      document.body.style.cursor = "grabbing";
    },
    [assets],
  );

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    document.body.style.cursor = "";
    setActiveAsset(null);
    const { active, over } = event;
    if (!over) return;

    const assetId = String(active.id);
    const dropData = over.data.current as { type: string; folderId: string | null } | undefined;
    if (!dropData || dropData.type !== "folder") return;

    const targetFolderId = dropData.folderId;

    fetch(`/api/cms/assets/${assetId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folder: targetFolderId || null }),
    }).then((res) => {
      if (res.ok) location.reload();
    });
  }, []);

  const handleDragCancel = useCallback(() => {
    document.body.style.cursor = "";
    setActiveAsset(null);
  }, []);

  // --- Folder actions ---

  function openMenu(folderId: string, folderName: string, rect: DOMRect) {
    setActiveFolderId(folderId);
    setActiveFolderName(folderName);
    setMenuPos({ top: rect.bottom + 4, left: rect.right - 160 });
    setMenuOpen(true);
  }

  function resetDialogState() {
    setLoading(false);
    setError(null);
  }

  async function handleCreateFolder() {
    if (!createName.trim()) return;
    setLoading(true);
    setError(null);
    const res = await fetch("/api/cms/assets/folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create", name: createName.trim(), parent: currentFolderId }),
    });
    if (res.ok) location.reload();
    else {
      setLoading(false);
      setError("Failed to create folder.");
    }
  }

  async function handleRenameFolder() {
    if (!renameName.trim() || renameName.trim() === activeFolderName) return;
    setLoading(true);
    setError(null);
    const res = await fetch("/api/cms/assets/folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "rename", id: activeFolderId, name: renameName.trim() }),
    });
    if (res.ok) location.reload();
    else {
      setLoading(false);
      setError("Failed to rename folder.");
    }
  }

  async function handleDeleteFolder() {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/cms/assets/folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", id: activeFolderId }),
    });
    if (res.ok) location.reload();
    else {
      setLoading(false);
      setError("Failed to delete folder.");
    }
  }

  async function handleBulkDelete() {
    setLoading(true);
    setError(null);
    const ids = Array.from(selectedIds);
    const results = await Promise.all(ids.map((id) => fetch(`/api/cms/assets/${id}`, { method: "DELETE" })));
    const failed = results.filter((r) => !r.ok).length;
    if (failed > 0 && failed === ids.length) {
      setLoading(false);
      setError("Failed to delete assets.");
      return;
    }
    location.reload();
  }

  const hasBreadcrumbs = breadcrumbs.length > 0;
  const isEmpty = folders.length === 0 && assets.length === 0;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <section className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Assets</h1>
            {hasBreadcrumbs && (
              <nav className="text-muted-foreground mt-2 flex items-center gap-1 text-sm">
                <DroppableBreadcrumb href="/admin/assets" folderId="" label="All assets" />
                {breadcrumbs.map((crumb) => (
                  <span key={crumb.id} className="contents">
                    <ChevronRight className="size-3.5" />
                    <DroppableBreadcrumb href={crumb.href} folderId={crumb.id} label={crumb.label} />
                  </span>
                ))}
              </nav>
            )}
          </div>
          <div className="flex items-center gap-2">
            {selectedIds.size > 0 ? (
              <>
                <span className="text-muted-foreground text-sm">{selectedIds.size} selected</span>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    resetDialogState();
                    setBulkDeleteOpen(true);
                  }}
                >
                  <Trash2 className="size-3.5" />
                  Delete
                </Button>
                <Button variant="outline" size="sm" onClick={clearSelection}>
                  Cancel
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setCreateName("");
                    resetDialogState();
                    setCreateOpen(true);
                  }}
                >
                  <FolderPlus className="size-4" />
                  New folder
                </Button>
                <label className={buttonVariants({ size: "sm" }) + " cursor-pointer"}>
                  <Upload className="size-4" />
                  Upload
                  <form
                    ref={uploadFormRef}
                    method="post"
                    action="/api/cms/assets/upload"
                    encType="multipart/form-data"
                    className="hidden"
                  >
                    <input type="hidden" name="redirectTo" value="/admin/assets" />
                    {currentFolderId && <input type="hidden" name="folder" value={currentFolderId} />}
                    <input
                      type="file"
                      name="file"
                      accept="image/*,video/*,audio/*,.pdf,.doc,.docx"
                      required
                      onChange={(e) => {
                        if (e.target.value) uploadFormRef.current?.submit();
                      }}
                    />
                  </form>
                </label>
              </>
            )}
          </div>
        </div>

        {/* Folders */}
        {folders.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {folders.map((folder) => (
              <DroppableFolder
                key={folder._id}
                folder={folder}
                onOpenMenu={openMenu}
                menuActive={menuOpen && activeFolderId === folder._id}
              />
            ))}
          </div>
        )}

        {/* Assets or empty state */}
        {isEmpty ? (
          <Card>
            <CardContent className="py-12">
              <div className="text-center">
                <ImagePlus className="text-muted-foreground/30 mx-auto size-12" />
                <p className="text-muted-foreground mt-3 text-sm">
                  {currentFolderId ? "This folder is empty." : "No assets uploaded yet."}
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          assets.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {assets.map((asset) => (
                <DraggableAssetCard
                  key={asset._id}
                  asset={asset}
                  selected={selectedIds.has(asset._id)}
                  onToggleSelect={() => toggleSelect(asset._id)}
                />
              ))}
            </div>
          )
        )}
      </section>

      {/* Drag overlay */}
      <DragOverlay dropAnimation={null}>{activeAsset && <AssetDragOverlay asset={activeAsset} />}</DragOverlay>

      {/* Context menu */}
      {menuOpen && (
        <div
          className="bg-popover text-popover-foreground border-border fixed z-50 min-w-40 rounded-md border p-1 shadow-md"
          style={{ top: menuPos.top, left: menuPos.left }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="hover:bg-accent flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm"
            onClick={() => {
              setMenuOpen(false);
              setRenameName(activeFolderName);
              resetDialogState();
              setRenameOpen(true);
            }}
          >
            <Pencil className="size-3.5" />
            Rename
          </button>
          <button
            type="button"
            className="text-destructive hover:bg-destructive/10 flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm"
            onClick={() => {
              setMenuOpen(false);
              resetDialogState();
              setDeleteOpen(true);
            }}
          >
            <Trash2 className="size-3.5" />
            Delete
          </button>
        </div>
      )}

      {/* Create folder dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New folder</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleCreateFolder();
            }}
          >
            <div className="grid gap-2 py-2">
              <Label htmlFor="folder-name">Name</Label>
              <Input
                id="folder-name"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="Folder name"
                autoFocus
              />
            </div>
            {error && <p className="text-destructive text-sm">{error}</p>}
            <DialogFooter className="mt-4">
              <DialogClose>
                <Button variant="outline" type="button">
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" disabled={!createName.trim() || loading}>
                Create
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Rename folder dialog */}
      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename folder</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleRenameFolder();
            }}
          >
            <div className="grid gap-2 py-2">
              <Label htmlFor="rename-name">Name</Label>
              <Input
                id="rename-name"
                value={renameName}
                onChange={(e) => setRenameName(e.target.value)}
                placeholder="Folder name"
                autoFocus
              />
            </div>
            {error && <p className="text-destructive text-sm">{error}</p>}
            <DialogFooter className="mt-4">
              <DialogClose>
                <Button variant="outline" type="button">
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" disabled={!renameName.trim() || renameName.trim() === activeFolderName || loading}>
                Rename
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete folder dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete folder</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &ldquo;{activeFolderName}&rdquo;? Assets in this folder will be moved to
              root.
            </DialogDescription>
          </DialogHeader>
          {error && <p className="text-destructive text-sm">{error}</p>}
          <DialogFooter className="mt-2">
            <DialogClose>
              <Button variant="outline" type="button">
                Cancel
              </Button>
            </DialogClose>
            <Button variant="destructive" onClick={handleDeleteFolder} disabled={loading}>
              <Trash2 className="size-3.5" />
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk delete dialog */}
      <Dialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete assets</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete {selectedIds.size} asset{selectedIds.size > 1 ? "s" : ""}? This action
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {error && <p className="text-destructive text-sm">{error}</p>}
          <DialogFooter className="mt-2">
            <DialogClose>
              <Button variant="outline" type="button">
                Cancel
              </Button>
            </DialogClose>
            <Button variant="destructive" onClick={handleBulkDelete} disabled={loading}>
              <Trash2 className="size-3.5" />
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Close menu on outside click */}
      {menuOpen && <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />}
    </DndContext>
  );
}
