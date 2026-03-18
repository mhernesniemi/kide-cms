import { useState, useRef, useCallback, useEffect } from "react";
import { ImagePlus, Loader2, Upload, X } from "lucide-react";
import { Button } from "@/components/admin/ui/button";
import ImageBrowseDialog from "@/components/admin/ImageBrowseDialog";

type Props = {
  name: string;
  value?: string;
  placeholder?: string;
  onChange?: (value: string) => void;
};

export default function ImagePicker({ name, value: initialValue, onChange: onChangeProp }: Props) {
  const [value, setValue] = useState(initialValue ?? "");
  const [assetId, setAssetId] = useState<string | null>(null);
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [open, setOpen] = useState(false);
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
      setLocalPreview(URL.createObjectURL(file));

      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/cms/assets/upload", { method: "POST", body: formData });
      if (!res.ok) throw new Error("Upload failed");
      const asset = await res.json();
      setValue(asset.url);
      setAssetId(asset._id);
      onChangeProp?.(asset.url);
    } catch (e) {
      console.error("Upload failed:", e);
      setLocalPreview(null);
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

  const imgSrc = localPreview ?? value;
  const isImage =
    value && (value.match(/\.(jpg|jpeg|png|gif|webp|avif|svg)$/i) || value.startsWith("http") || localPreview);

  return (
    <div className="space-y-3">
      <input ref={hiddenRef} type="hidden" name={name} value={value} />

      {value && (
        <div className="group relative inline-block">
          {isImage ? (
            <a
              href={assetId ? `/admin/assets/${assetId}` : undefined}
              className={`block size-40 overflow-hidden rounded-lg border ${assetId ? "hover:border-foreground/50 cursor-pointer" : ""}`}
            >
              <img src={imgSrc} alt="" className="size-full object-cover" />
            </a>
          ) : (
            <div className="bg-muted/30 flex size-40 items-center justify-center rounded-lg border">
              <span className="text-muted-foreground truncate px-4 text-sm">{value}</span>
            </div>
          )}
          <button
            type="button"
            title="Remove image"
            onClick={() => {
              if (localPreview) URL.revokeObjectURL(localPreview);
              setLocalPreview(null);
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

      <ImageBrowseDialog
        open={open}
        onOpenChange={setOpen}
        onSelect={(asset) => {
          if (localPreview) URL.revokeObjectURL(localPreview);
          setLocalPreview(null);
          setValue(asset.url);
          setAssetId(asset._id);
          onChangeProp?.(asset.url);
        }}
      />
    </div>
  );
}
