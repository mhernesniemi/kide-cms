import { useState, useRef, useCallback, useEffect } from "react";
import { ChevronRight, Folder, ImagePlus, Loader2, Upload, X } from "lucide-react";
import { Button } from "@/components/admin/ui/button";
import { Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle } from "@/components/admin/ui/dialog";

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
  name: string;
  value?: string;
  placeholder?: string;
  onChange?: (value: string) => void;
};

export default function ImagePicker({ name, value: initialValue, onChange: onChangeProp }: Props) {
  const [value, setValue] = useState(initialValue ?? "");
  const [assetId, setAssetId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [open, setOpen] = useState(false);
  const [browse, setBrowse] = useState<BrowseState>({
    folderId: null,
    folders: [],
    assets: [],
    breadcrumbs: [{ id: null, name: "All assets" }],
    loading: false,
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hiddenRef = useRef<HTMLInputElement>(null);

  // Resolve asset ID from URL on mount
  useEffect(() => {
    if (!value) return;
    fetch(`/api/cms/assets?url=${encodeURIComponent(value)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((asset) => {
        if (asset?._id) setAssetId(asset._id);
      })
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Notify the form of value changes so UnsavedGuard detects them
  const prevValueRef = useRef(value);
  useEffect(() => {
    if (prevValueRef.current !== value) {
      prevValueRef.current = value;
      hiddenRef.current?.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }, [value]);

  const handleUpload = useCallback(async (file: File) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/cms/assets/upload", { method: "POST", body: formData });
      if (!res.ok) throw new Error("Upload failed");
      const asset: AssetRecord = await res.json();
      // Wait for Vite to pick up the new file before showing thumbnail
      await new Promise((r) => setTimeout(r, 300));
      setValue(asset.url);
      setAssetId(asset._id);
      onChangeProp?.(asset.url);
    } catch (e) {
      console.error("Upload failed:", e);
    } finally {
      setUploading(false);
    }
  }, []);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleUpload(file);
    },
    [handleUpload],
  );

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
      const newBreadcrumbs = [...browse.breadcrumbs, { id: folder._id, name: folder.name }];
      loadFolder(folder._id, newBreadcrumbs);
    },
    [browse.breadcrumbs, loadFolder],
  );

  const navigateToBreadcrumb = useCallback(
    (index: number) => {
      const crumb = browse.breadcrumbs[index];
      const newBreadcrumbs = browse.breadcrumbs.slice(0, index + 1);
      loadFolder(crumb.id, newBreadcrumbs);
    },
    [browse.breadcrumbs, loadFolder],
  );

  const selectAsset = useCallback(
    (asset: AssetRecord) => {
      setValue(asset.url);
      setAssetId(asset._id);
      onChangeProp?.(asset.url);
      setOpen(false);
    },
    [onChangeProp],
  );

  // Load root folder when dialog opens
  useEffect(() => {
    if (open) {
      const initial: BrowseState["breadcrumbs"] = [{ id: null, name: "All assets" }];
      loadFolder(null, initial);
    }
  }, [open, loadFolder]);

  const isImage = value && (value.match(/\.(jpg|jpeg|png|gif|webp|avif|svg)$/i) || value.startsWith("http"));

  return (
    <div className="space-y-3">
      <input ref={hiddenRef} type="hidden" name={name} value={value} />

      {value && (
        <div className="group relative inline-block">
          {isImage ? (
            assetId ? (
              <a
                href={`/admin/assets/${assetId}`}
                className="hover:border-foreground/50 block size-40 cursor-pointer overflow-hidden rounded-lg border transition-colors"
              >
                <img src={value} alt="" className="size-full object-cover" />
              </a>
            ) : (
              <img src={value} alt="" className="size-40 rounded-lg border object-cover" />
            )
          ) : (
            <div className="bg-muted/30 flex size-40 items-center justify-center rounded-lg border">
              <span className="text-muted-foreground truncate px-4 text-sm">{value}</span>
            </div>
          )}
          <button
            type="button"
            onClick={() => {
              setValue("");
              setAssetId(null);
              onChangeProp?.("");
            }}
            className="border-foreground/25 hover:border-foreground bg-background/80 absolute top-2 right-2 flex size-5 items-center justify-center rounded border opacity-0 backdrop-blur-sm transition-[opacity,border-color] group-hover:opacity-100"
          >
            <X className="size-3" />
          </button>
        </div>
      )}

      <div className="flex gap-2">
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="text-foreground/70"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? <Loader2 className="size-3 animate-spin" /> : <Upload className="size-4 stroke-1" />}
          Upload
        </Button>
        <Button type="button" variant="outline" size="sm" className="text-foreground/70" onClick={() => setOpen(true)}>
          <ImagePlus className="size-4 stroke-1" />
          Browse
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle>Media Library</DialogTitle>
              <DialogClose>
                <button
                  type="button"
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
                        onClick={() => selectAsset(asset)}
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
    </div>
  );
}
