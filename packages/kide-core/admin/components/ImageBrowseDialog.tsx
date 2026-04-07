import { useState, useCallback, useEffect } from "react";
import { ChevronRight, Folder, Loader2, X } from "lucide-react";
import { Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";

type AssetRecord = {
  _id: string;
  filename: string;
  mimeType: string;
  url: string;
  _createdAt: string;
};

type FolderRecord = {
  _id: string;
  name: string;
};

type BrowseState = {
  folderId: string | null;
  folders: FolderRecord[];
  assets: AssetRecord[];
  breadcrumbs: Array<{ id: string | null; name: string }>;
  loading: boolean;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (asset: AssetRecord) => void;
};

export default function ImageBrowseDialog({ open, onOpenChange, onSelect }: Props) {
  const [browse, setBrowse] = useState<BrowseState>({
    folderId: null,
    folders: [],
    assets: [],
    breadcrumbs: [{ id: null, name: "All assets" }],
    loading: false,
  });

  const loadFolder = useCallback(async (folderId: string | null, breadcrumbs: BrowseState["breadcrumbs"]) => {
    setBrowse((prev) => ({ ...prev, loading: true, folderId, breadcrumbs }));
    try {
      const folderParam = folderId ? `&folder=${folderId}` : "&folder=";
      const [assetsRes, foldersRes] = await Promise.all([
        fetch(`/api/cms/assets?limit=50${folderParam}`),
        fetch(`/api/cms/assets/folders?parent=${folderId ?? ""}`),
      ]);
      const assetsData = await assetsRes.json();
      const foldersData = await foldersRes.json();
      setBrowse((prev) => ({
        ...prev,
        folders: foldersData ?? [],
        assets: (assetsData.items ?? []).filter((a: AssetRecord) => a.mimeType.startsWith("image/")),
        loading: false,
      }));
    } catch {
      setBrowse((prev) => ({ ...prev, folders: [], assets: [], loading: false }));
    }
  }, []);

  const navigateToFolder = useCallback(
    (folder: FolderRecord) => {
      loadFolder(folder._id, [...browse.breadcrumbs, { id: folder._id, name: folder.name }]);
    },
    [browse.breadcrumbs, loadFolder],
  );

  const navigateToBreadcrumb = useCallback(
    (index: number) => {
      const crumb = browse.breadcrumbs[index];
      loadFolder(crumb.id, browse.breadcrumbs.slice(0, index + 1));
    },
    [browse.breadcrumbs, loadFolder],
  );

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadFolder(null, [{ id: null, name: "All assets" }]);
    }
  }, [open, loadFolder]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>Media Library</DialogTitle>
            <DialogClose>
              <button
                type="button"
                title="Close"
                className="text-muted-foreground hover:text-foreground rounded-md p-1 transition-colors"
              >
                <X className="size-5" />
              </button>
            </DialogClose>
          </div>
        </DialogHeader>

        {browse.breadcrumbs.length > 1 && (
          <nav className="text-muted-foreground flex items-center gap-1 text-sm">
            {browse.breadcrumbs.map((crumb, i) => (
              <span key={crumb.id ?? "root"} className="contents">
                {i > 0 && <ChevronRight className="size-3.5 shrink-0" />}
                {i < browse.breadcrumbs.length - 1 ? (
                  <button
                    type="button"
                    onClick={() => navigateToBreadcrumb(i)}
                    className="hover:text-foreground truncate transition-colors"
                  >
                    {crumb.name}
                  </button>
                ) : (
                  <span className="text-foreground truncate font-medium">{crumb.name}</span>
                )}
              </span>
            ))}
          </nav>
        )}

        <div className="max-h-[60vh] overflow-y-auto">
          {browse.loading ? (
            <div className="flex h-48 items-center justify-center">
              <Loader2 className="text-muted-foreground size-6 animate-spin" />
            </div>
          ) : (
            <div className="space-y-4">
              {browse.folders.length > 0 && (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {browse.folders.map((folder) => (
                    <button
                      key={folder._id}
                      type="button"
                      onClick={() => navigateToFolder(folder)}
                      className="hover:bg-accent flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors"
                    >
                      <Folder className="text-muted-foreground size-4 shrink-0" />
                      <span className="truncate">{folder.name}</span>
                    </button>
                  ))}
                </div>
              )}

              {browse.assets.length > 0 ? (
                <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                  {browse.assets.map((asset) => (
                    <button
                      key={asset._id}
                      type="button"
                      onClick={() => {
                        onSelect(asset);
                        onOpenChange(false);
                      }}
                      className="hover:border-foreground relative aspect-square overflow-hidden rounded-lg border transition-colors"
                    >
                      <img src={asset.url} alt={asset.filename} className="size-full object-cover" />
                    </button>
                  ))}
                </div>
              ) : (
                browse.folders.length === 0 && (
                  <div className="text-muted-foreground flex h-48 items-center justify-center text-sm">
                    {browse.folderId ? "This folder is empty." : "No images uploaded yet."}
                  </div>
                )
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
