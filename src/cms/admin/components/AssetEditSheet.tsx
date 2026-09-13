import { useRef } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "./ui/sheet";

export type EditedAsset = { _id: string; alt: string | null; focalX: number | null; focalY: number | null };

type Props = {
  assetId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: (asset: EditedAsset) => void;
  onDeleted?: () => void;
};

/**
 * The asset's own edit page in a side panel. Its form posts redirect inside the iframe,
 * so a successful save or delete shows up as a same-origin navigation.
 */
export default function AssetEditSheet({ assetId, open, onOpenChange, onSaved, onDeleted }: Props) {
  const frameRef = useRef<HTMLIFrameElement>(null);

  const handleLoad = () => {
    const location = frameRef.current?.contentWindow?.location;
    if (!location || !assetId) return;
    if (new URLSearchParams(location.search).get("_toast") !== "success") return;

    if (location.pathname === `/admin/assets/${assetId}`) {
      onOpenChange(false);
      fetch(`/api/cms/assets/${assetId}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((asset) => {
          if (asset) onSaved?.(asset);
        })
        .catch(() => {});
    } else if (location.pathname === "/admin/assets") {
      onOpenChange(false);
      onDeleted?.();
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="data-[side=right]:w-[90vw] data-[side=right]:sm:max-w-[90vw] data-[side=right]:lg:w-[50vw] data-[side=right]:lg:max-w-[50vw]"
      >
        <SheetHeader className="sr-only">
          <SheetTitle>Edit image</SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-hidden">
          {open && assetId && (
            <iframe
              ref={frameRef}
              src={`/admin/assets/${assetId}?_embed=1`}
              title="Edit image"
              className="size-full"
              onLoad={handleLoad}
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
