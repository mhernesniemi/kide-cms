import { useState, useRef, useCallback } from "react";
import { ImagePlus, Upload, X, Loader2 } from "lucide-react";
import { Button } from "@/components/admin/ui/button";

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
  onChange?: (value: string) => void;
};

export default function ImagePicker({ name, value: initialValue, placeholder, onChange: onChangeProp }: Props) {
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

  const selectAsset = useCallback(
    (asset: AssetRecord) => {
      setValue(asset.url);
      onChangeProp?.(asset.url);
      setShowBrowser(false);
    },
    [onChangeProp],
  );

  const isImage = value && (value.match(/\.(jpg|jpeg|png|gif|webp|avif|svg)$/i) || value.startsWith("http"));

  return (
    <div className="space-y-3">
      <input type="hidden" name={name} value={value} />

      {value && (
        <div className="group relative">
          {isImage ? (
            <img src={value} alt="" className="h-40 w-full rounded-lg border object-cover" />
          ) : (
            <div className="bg-muted/30 flex h-40 items-center justify-center rounded-lg border">
              <span className="text-muted-foreground truncate px-4 text-sm">{value}</span>
            </div>
          )}
          <button
            type="button"
            onClick={() => {
              setValue("");
              onChangeProp?.("");
            }}
            className="bg-background/80 absolute top-2 right-2 rounded-md p-1.5 opacity-0 shadow-sm backdrop-blur transition-opacity group-hover:opacity-100"
          >
            <X className="size-4" />
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
        <Button type="button" variant="outline" size="sm" className="text-foreground/70" onClick={openBrowser}>
          <ImagePlus className="size-4 stroke-1" />
          Browse
        </Button>
      </div>

      {/* Asset Browser Modal */}
      {showBrowser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-background max-h-[80vh] w-full max-w-3xl overflow-hidden rounded-xl border shadow-lg">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <h3 className="font-semibold">Media Library</h3>
              <button type="button" onClick={() => setShowBrowser(false)} className="hover:bg-accent rounded-md p-1">
                <X className="size-4" />
              </button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto p-4">
              {loadingAssets ? (
                <div className="flex h-40 items-center justify-center">
                  <Loader2 className="text-muted-foreground size-6 animate-spin" />
                </div>
              ) : assets.length === 0 ? (
                <div className="text-muted-foreground flex h-40 items-center justify-center text-sm">
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
                        className="group hover:ring-primary relative aspect-square overflow-hidden rounded-lg border transition-all hover:ring-2"
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
