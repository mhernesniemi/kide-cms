"use client";

import { useState, useCallback, useRef, useMemo } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Folder,
  FolderPlus,
  GripVertical,
  Images,
  ImagePlus,
  MoreHorizontal,
  Pencil,
  Search,
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
import { cn, thumbnail } from "../lib/utils";
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
  parent: string | null;
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
  search: string;
  page: number;
  totalPages: number;
  total: number;
};

// Build a "/admin/assets" URL preserving folder + search, overriding what's passed.
function assetsUrl(opts: { folder?: string | null; q?: string; page?: number }) {
  const sp = new URLSearchParams();
  if (opts.folder) sp.set("folder", opts.folder);
  if (opts.q?.trim()) sp.set("q", opts.q.trim());
  if (opts.page && opts.page > 1) sp.set("page", String(opts.page));
  const qs = sp.toString();
  return qs ? `/admin/assets?${qs}` : "/admin/assets";
}

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
                <img src={thumbnail(asset.url)} alt={asset.alt ?? asset.filename} className="size-full object-cover" />
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
// Sidebar folder row (drop target + link)
// -----------------------------------------------

function FolderRow({
  folderId,
  label,
  href,
  depth,
  active,
  Icon,
  onOpenMenu,
  menuActive,
}: {
  folderId: string | null;
  label: string;
  href: string;
  depth: number;
  active: boolean;
  Icon: typeof Folder;
  onOpenMenu?: (folderId: string, folderName: string, rect: DOMRect) => void;
  menuActive?: boolean;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: `folder-${folderId ?? "root"}`,
    data: { type: "folder", folderId },
  });

  return (
    <div ref={setNodeRef} className="group/row relative" style={{ paddingLeft: `${depth * 0.75}rem` }}>
      <a
        href={href}
        className={cn(
          "flex items-center gap-2 rounded-md py-1.5 pr-7 pl-2 text-sm transition-colors",
          active ? "bg-foreground/10 text-foreground font-medium" : "text-foreground/70 hover:bg-foreground/5",
          isOver && "ring-primary bg-primary/10 text-foreground ring-1",
        )}
      >
        <Icon className="text-muted-foreground size-4 shrink-0" />
        <span className="truncate">{label}</span>
      </a>
      {onOpenMenu && folderId && (
        <button
          type="button"
          title="Folder options"
          className={cn(
            "text-muted-foreground hover:text-foreground absolute top-1/2 right-1 -translate-y-1/2 rounded p-1 transition-opacity",
            menuActive ? "opacity-100" : "opacity-0 group-hover/row:opacity-100",
          )}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onOpenMenu(folderId, label, e.currentTarget.getBoundingClientRect());
          }}
        >
          <MoreHorizontal className="size-4" />
        </button>
      )}
    </div>
  );
}

// -----------------------------------------------
// Drag overlay (ghost while dragging)
// -----------------------------------------------

function AssetDragOverlay({ asset }: { asset: AssetItem }) {
  return (
    <div className="w-40" style={{ transform: "rotate(2deg) scale(0.95)" }}>
      <Card className="overflow-hidden pt-0 shadow-lg">
        <div className="relative">
          {asset.mimeType.startsWith("image/") ? (
            <div className="bg-muted/30 aspect-square w-full overflow-hidden">
              <img src={thumbnail(asset.url)} alt={asset.alt ?? asset.filename} className="size-full object-cover" />
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

export default function AssetsGrid({
  folders,
  assets,
  breadcrumbs,
  currentFolderId,
  search,
  page,
  totalPages,
  total,
}: Props) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeAsset, setActiveAsset] = useState<AssetItem | null>(null);
  const [query, setQuery] = useState(search);

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
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // Flatten the folder tree into depth-tagged rows for the sidebar.
  const folderTree = useMemo(() => {
    const byParent = new Map<string, FolderItem[]>();
    for (const f of folders) {
      const key = f.parent ?? "";
      if (!byParent.has(key)) byParent.set(key, []);
      byParent.get(key)!.push(f);
    }
    const rows: Array<{ folder: FolderItem; depth: number }> = [];
    const walk = (parentKey: string, depth: number) => {
      const children = (byParent.get(parentKey) ?? []).sort((a, b) => a.name.localeCompare(b.name));
      for (const folder of children) {
        rows.push({ folder, depth });
        walk(folder._id, depth + 1);
      }
    };
    walk("", 0);
    return rows;
  }, [folders]);

  // --- Search (server-side, via the URL) ---

  const runSearch = useCallback(
    (value: string) => {
      setQuery(value);
      if (searchTimer.current) clearTimeout(searchTimer.current);
      searchTimer.current = setTimeout(() => {
        window.location.assign(assetsUrl({ folder: currentFolderId, q: value }));
      }, 350);
    },
    [currentFolderId],
  );

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

    fetch(`/api/cms/assets/${assetId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folder: dropData.folderId || null }),
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

  const folderName = breadcrumbs.length > 0 ? breadcrumbs[breadcrumbs.length - 1].label : "All assets";

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <section className="px-4 py-6 lg:py-8 lg:pr-8 lg:pl-12">
        <h1 className="mb-6 text-2xl font-semibold tracking-tight">Assets</h1>

        <div className="grid gap-8 lg:grid-cols-[230px_minmax(0,1fr)]">
          {/* ── Sticky sidebar: actions + folder tree (always-on drop targets) ── */}
          <aside className="lg:sticky lg:top-8 lg:max-h-[calc(100vh-4rem)] lg:self-start lg:overflow-y-auto">
            <div className="space-y-4">
              <label className={cn(buttonVariants({ size: "sm" }), "w-full cursor-pointer")}>
                <Upload className="size-4" />
                Upload
                <form
                  ref={uploadFormRef}
                  method="post"
                  action="/api/cms/assets/upload"
                  encType="multipart/form-data"
                  className="hidden"
                >
                  <input type="hidden" name="redirectTo" value={assetsUrl({ folder: currentFolderId })} />
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

              <div>
                <div className="mb-1 flex items-center justify-between px-2">
                  <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">Folders</span>
                  <button
                    type="button"
                    title="New folder"
                    className="text-muted-foreground hover:text-foreground rounded p-1"
                    onClick={() => {
                      setCreateName("");
                      resetDialogState();
                      setCreateOpen(true);
                    }}
                  >
                    <FolderPlus className="size-4" />
                  </button>
                </div>
                <nav className="space-y-0.5">
                  <FolderRow
                    folderId={null}
                    label="All assets"
                    href={assetsUrl({})}
                    depth={0}
                    active={!currentFolderId}
                    Icon={Images}
                  />
                  {folderTree.map(({ folder, depth }) => (
                    <FolderRow
                      key={folder._id}
                      folderId={folder._id}
                      label={folder.name}
                      href={assetsUrl({ folder: folder._id })}
                      depth={depth}
                      active={currentFolderId === folder._id}
                      Icon={Folder}
                      onOpenMenu={openMenu}
                      menuActive={menuOpen && activeFolderId === folder._id}
                    />
                  ))}
                </nav>
              </div>
            </div>
          </aside>

          {/* ── Main: search, grid, pagination ── */}
          <div className="min-w-0 space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-muted-foreground min-w-0 text-sm">
                <span className="text-foreground font-medium">{folderName}</span>
                <span className="ml-2">
                  {total} {total === 1 ? "item" : "items"}
                </span>
              </div>
              <div className="relative w-full sm:w-72">
                <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
                <Input
                  value={query}
                  onChange={(e) => runSearch(e.target.value)}
                  placeholder="Filter by name…"
                  className="pl-9 text-sm"
                />
              </div>
            </div>

            {/* Selection toolbar */}
            {selectedIds.size > 0 && (
              <div className="bg-muted/40 flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
                <span className="text-sm font-medium">{selectedIds.size} selected</span>
                <div className="flex items-center gap-2">
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
                </div>
              </div>
            )}

            {/* Grid or empty state */}
            {assets.length > 0 ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                {assets.map((asset) => (
                  <DraggableAssetCard
                    key={asset._id}
                    asset={asset}
                    selected={selectedIds.has(asset._id)}
                    onToggleSelect={() => toggleSelect(asset._id)}
                  />
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="py-12">
                  <div className="text-center">
                    <ImagePlus className="text-muted-foreground/30 mx-auto size-12" />
                    <p className="text-muted-foreground mt-3 text-sm">
                      {search
                        ? `No assets match “${search}”.`
                        : currentFolderId
                          ? "This folder is empty."
                          : "No assets uploaded yet."}
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 pt-2">
                <a
                  href={assetsUrl({ folder: currentFolderId, q: search, page: page - 1 })}
                  className={cn(
                    buttonVariants({ variant: "outline", size: "sm" }),
                    page <= 1 && "pointer-events-none opacity-50",
                  )}
                  aria-disabled={page <= 1}
                >
                  <ChevronLeft className="size-4" />
                  Previous
                </a>
                <span className="text-muted-foreground px-2 text-sm">
                  Page {page} of {totalPages}
                </span>
                <a
                  href={assetsUrl({ folder: currentFolderId, q: search, page: page + 1 })}
                  className={cn(
                    buttonVariants({ variant: "outline", size: "sm" }),
                    page >= totalPages && "pointer-events-none opacity-50",
                  )}
                  aria-disabled={page >= totalPages}
                >
                  Next
                  <ChevronRight className="size-4" />
                </a>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Drag overlay */}
      <DragOverlay dropAnimation={null}>{activeAsset && <AssetDragOverlay asset={activeAsset} />}</DragOverlay>

      {/* Folder context menu */}
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
