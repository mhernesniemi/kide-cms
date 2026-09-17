"use client";

import { useEffect } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "./ui/sheet";

export type SavedSharedSection = { _id: string; title?: string; blockType?: string };

type Props = {
  sectionId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: (section: SavedSharedSection) => void;
};

/**
 * The shared section's own edit page in a side panel. The embedded form posts
 * `cms:created` on a successful save (see EditScripts), which closes the panel
 * and hands back the refreshed document so the referencing block can update the
 * title it caches.
 */
export default function SharedSectionEditSheet({ sectionId, open, onOpenChange, onSaved }: Props) {
  useEffect(() => {
    if (!open || !sectionId) return;

    const handleMessage = (e: MessageEvent) => {
      if (e.data?.type !== "cms:created" || String(e.data.id) !== sectionId) return;
      onOpenChange(false);
      fetch(`/api/cms/shared-sections/${sectionId}?status=any`, { credentials: "same-origin" })
        .then((res) => (res.ok ? res.json() : null))
        .then((section) => {
          if (section) onSaved?.(section as SavedSharedSection);
        })
        .catch(() => {});
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [open, sectionId, onOpenChange, onSaved]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="data-[side=right]:w-[90vw] data-[side=right]:sm:max-w-[90vw] data-[side=right]:lg:w-[50vw] data-[side=right]:lg:max-w-[50vw]"
      >
        <SheetHeader className="sr-only">
          <SheetTitle>Edit shared section</SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-hidden">
          {open && sectionId && (
            <iframe
              src={`/admin/shared-sections/${sectionId}?_embed=1`}
              title="Edit shared section"
              className="size-full"
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
