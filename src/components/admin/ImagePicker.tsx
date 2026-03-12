import { useState, useRef, useCallback } from "react";
import { ImagePlus, Upload, X, Loader2 } from "lucide-react";

type AssetRecord = {
  _id: string;
  filename: string;
  mimeType: string;
  url: string;
  _createdAt: string;
};

type Props = {
  name: string;
  value?: string;
  placeholder?: string;
};

export default function ImagePicker({ name, value: initialValue, placeholder }: Props) {
  const [value, setValue] = useState(initialValue ?? "");
  const [uploading, setUploading] = useState(false);
  const [showBrowser, setShowBrowser] = useState(false);
  const [assets, setAssets] = useState<AssetRecord[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = useCallback(async (file: File) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/cms/assets/upload", { method: "POST", body: formData });
      if (!res.ok) throw new Error("Upload failed");
      const asset: AssetRecord = await res.json();
      setValue(asset.url);
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

  const openBrowser = useCallback(async () => {
    setShowBrowser(true);
    setLoadingAssets(true);
    try {
      const res = await fetch("/api/cms/assets?limit=50");
      const data = await res.json();
      setAssets(data.items ?? []);
    } catch {
      setAssets([]);
    } finally {
      setLoadingAssets(false);
    }
  }, []);

  const selectAsset = useCallback((asset: AssetRecord) => {
    setValue(asset.url);
    setShowBrowser(false);
  }, []);

  const isImage = value && (value.match(/\.(jpg|jpeg|png|gif|webp|avif|svg)$/i) || value.startsWith("http"));

  return (
    <div className="space-y-3">
      <input type="hidden" name={name} value={value} />

      {value ? (
        <div className="group relative">
          {isImage ? (
            <img src={value} alt="" className="h-40 w-full rounded-lg border object-cover" />
          ) : (
            <div className="flex h-40 items-center justify-center rounded-lg border bg-muted/30">
              <span className="truncate px-4 text-sm text-muted-foreground">{value}</span>
            </div>
          )}
          <button
            type="button"
            onClick={() => setValue("")}
            className="absolute right-2 top-2 rounded-md bg-background/80 p-1.5 opacity-0 shadow-sm backdrop-blur transition-opacity group-hover:opacity-100"
          >
            <X className="size-4" />
          </button>
        </div>
      ) : (
        <div className="flex h-32 items-center justify-center rounded-lg border border-dashed bg-muted/20">
          <div className="text-center">
            <ImagePlus className="mx-auto size-8 text-muted-foreground/50" />
            <p className="mt-1 text-xs text-muted-foreground">{placeholder || "Upload or select an image"}</p>
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="inline-flex items-center gap-2 rounded-md border bg-background px-3 py-1.5 text-sm transition-colors hover:bg-accent disabled:opacity-50"
        >
          {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
          Upload
        </button>
        <button
          type="button"
          onClick={openBrowser}
          className="inline-flex items-center gap-2 rounded-md border bg-background px-3 py-1.5 text-sm transition-colors hover:bg-accent"
        >
          <ImagePlus className="size-4" />
          Browse
        </button>
      </div>

      {/* Asset Browser Modal */}
      {showBrowser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[80vh] w-full max-w-3xl overflow-hidden rounded-xl border bg-background shadow-lg">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <h3 className="font-semibold">Media Library</h3>
              <button type="button" onClick={() => setShowBrowser(false)} className="rounded-md p-1 hover:bg-accent">
                <X className="size-4" />
              </button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto p-4">
              {loadingAssets ? (
                <div className="flex h-40 items-center justify-center">
                  <Loader2 className="size-6 animate-spin text-muted-foreground" />
                </div>
              ) : assets.length === 0 ? (
                <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
                  No assets uploaded yet.
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                  {assets
                    .filter((a) => a.mimeType.startsWith("image/"))
                    .map((asset) => (
                      <button
                        key={asset._id}
                        type="button"
                        onClick={() => selectAsset(asset)}
                        className="group relative aspect-square overflow-hidden rounded-lg border transition-all hover:ring-2 hover:ring-primary"
                      >
                        <img src={asset.url} alt={asset.filename} className="size-full object-cover" />
                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100">
                          <p className="truncate text-xs text-white">{asset.filename}</p>
                        </div>
                      </button>
                    ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
