"use client";

import { useState } from "react";
import { CalendarClock, CheckIcon, EllipsisVertical } from "lucide-react";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

type Version = {
  version: number;
  createdAt: string;
};

type Props = {
  formId: string;
  collectionSlug?: string;
  documentId?: string;
  showUnpublish?: boolean;
  showDiscardDraft?: boolean;
  showDelete?: boolean;
  showDuplicate?: boolean;
  showSchedule?: boolean;
  showCancelSchedule?: boolean;
  currentPublishAt?: string;
  currentUnpublishAt?: string;
  versions?: Version[];
  restoreEndpoint?: string;
  redirectTo?: string;
};

export default function DocumentActions({
  formId,
  collectionSlug,
  documentId,
  showUnpublish,
  showDiscardDraft,
  showDelete,
  showDuplicate,
  showSchedule,
  showCancelSchedule,
  currentPublishAt,
  currentUnpublishAt,
  versions = [],
  restoreEndpoint,
  redirectTo,
}: Props) {
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [refWarning, setRefWarning] = useState<string | null>(null);
  const [publishAt, setPublishAt] = useState(currentPublishAt ? toLocalDatetime(currentPublishAt) : "");
  const [unpublishAt, setUnpublishAt] = useState(currentUnpublishAt ? toLocalDatetime(currentUnpublishAt) : "");

  const canDuplicate = !!(showDuplicate && collectionSlug && documentId);
  const hasActions =
    canDuplicate || showUnpublish || showDiscardDraft || showDelete || showSchedule || showCancelSchedule || versions.length > 0;
  if (!hasActions) return null;

  const duplicate = async () => {
    if (!collectionSlug || !documentId) return;
    try {
      const res = await fetch(`/api/cms/${collectionSlug}/${documentId}/duplicate`, {
        method: "POST",
        headers: { Accept: "application/json" },
      });
      if (!res.ok) throw new Error("Duplicate failed");
      const created = await res.json();
      window.location.assign(`/admin/${collectionSlug}/${created._id}?_toast=success&_msg=Document+duplicated`);
    } catch {
      window.location.assign(`${window.location.pathname}?_toast=error&_msg=Failed+to+duplicate`);
    }
  };

  const submitAction = (action: string) => {
    const form = document.getElementById(formId) as HTMLFormElement | null;
    if (!form) return;
    const input = form.querySelector<HTMLInputElement>('input[name="_action"]');
    if (input) input.value = action;
    form.submit();
  };

  const submitSchedule = () => {
    if (!publishAt) return;

    const form = document.getElementById(formId) as HTMLFormElement | null;
    if (!form) return;

    const intentInput = form.querySelector<HTMLInputElement>('input[name="_intent"]');
    if (!intentInput) {
      const hidden = document.createElement("input");
      hidden.type = "hidden";
      hidden.name = "_intent";
      hidden.value = "schedule";
      form.appendChild(hidden);
    } else {
      intentInput.value = "schedule";
    }

    // Inject _publishAt
    let publishAtInput = form.querySelector<HTMLInputElement>('input[name="_publishAt"]');
    if (!publishAtInput) {
      publishAtInput = document.createElement("input");
      publishAtInput.type = "hidden";
      publishAtInput.name = "_publishAt";
      form.appendChild(publishAtInput);
    }
    publishAtInput.value = new Date(publishAt).toISOString();

    // Inject _unpublishAt
    let unpublishAtInput = form.querySelector<HTMLInputElement>('input[name="_unpublishAt"]');
    if (!unpublishAtInput) {
      unpublishAtInput = document.createElement("input");
      unpublishAtInput.type = "hidden";
      unpublishAtInput.name = "_unpublishAt";
      form.appendChild(unpublishAtInput);
    }
    unpublishAtInput.value = unpublishAt ? new Date(unpublishAt).toISOString() : "";

    form.submit();
  };

  const restoreVersion = (version: number) => {
    if (!restoreEndpoint) return;
    const form = document.createElement("form");
    form.method = "post";
    form.action = restoreEndpoint;
    form.innerHTML = `
      <input type="hidden" name="_action" value="restore" />
      <input type="hidden" name="version" value="${version}" />
      <input type="hidden" name="redirectTo" value="${redirectTo ?? window.location.pathname + window.location.search}" />
    `;
    document.body.appendChild(form);
    form.submit();
  };

  const sortedVersions = versions.slice().sort((a, b) => Number(b.version) - Number(a.version));
  const latestVersion = sortedVersions.length > 0 ? Number(sortedVersions[0].version) : undefined;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label="More actions">
            <EllipsisVertical className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          {canDuplicate && <DropdownMenuItem onClick={duplicate}>Duplicate</DropdownMenuItem>}
          {showSchedule && <DropdownMenuItem onClick={() => setScheduleOpen(true)}>Schedule publish</DropdownMenuItem>}
          {showCancelSchedule && (
            <DropdownMenuItem onClick={() => submitAction("unpublish")}>Cancel schedule</DropdownMenuItem>
          )}
          {showDiscardDraft && (
            <DropdownMenuItem onClick={() => submitAction("discard-draft")}>Discard changes</DropdownMenuItem>
          )}
          {showUnpublish && (
            <DropdownMenuItem onClick={() => submitAction("unpublish")}>Move to draft</DropdownMenuItem>
          )}
          {sortedVersions.length > 0 && (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>Restore version</DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="max-h-64 overflow-y-auto">
                {sortedVersions.map((v) => {
                  const vNum = Number(v.version);
                  const isCurrent = vNum === latestVersion;
                  return (
                    <DropdownMenuItem
                      key={vNum}
                      disabled={isCurrent}
                      onClick={() => restoreVersion(vNum)}
                      className="flex items-center justify-between gap-3"
                    >
                      <span>
                        v{vNum}
                        {isCurrent ? " (current)" : ""}
                      </span>
                      {isCurrent && <CheckIcon className="text-muted-foreground size-3.5" />}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )}
          {(showUnpublish || showSchedule || showCancelSchedule || sortedVersions.length > 0) && showDelete && (
            <DropdownMenuSeparator />
          )}
          {showDelete && (
            <DropdownMenuItem
              variant="destructive"
              onClick={async () => {
                setRefWarning(null);
                if (collectionSlug && documentId) {
                  try {
                    const res = await fetch(`/api/cms/references/${collectionSlug}/${documentId}`);
                    if (res.ok) {
                      const { refs, total } = await res.json();
                      if (total > 0) {
                        const parts = refs.map(
                          (r: { collection: string; count: number }) => `${r.count} ${r.collection.toLowerCase()}`,
                        );
                        setRefWarning(
                          `This document is referenced by ${parts.join(", ")}. Deleting it will leave broken references.`,
                        );
                      }
                    }
                  } catch {}
                }
                setDeleteOpen(true);
              }}
            >
              Delete
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Schedule publish</DialogTitle>
            <DialogDescription>Set a date and time for this document to be published automatically.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <label htmlFor="schedule-publish-at" className="text-sm font-medium">
                Publish at
              </label>
              <input
                id="schedule-publish-at"
                type="datetime-local"
                value={publishAt}
                onChange={(e) => setPublishAt(e.target.value)}
                className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex h-9 w-full rounded-md border px-3 py-1 text-sm shadow-sm transition-colors focus-visible:ring-1 focus-visible:outline-none"
              />
            </div>
            <div className="grid gap-2">
              <label htmlFor="schedule-unpublish-at" className="text-sm font-medium">
                Unpublish at <span className="text-muted-foreground">(optional)</span>
              </label>
              <input
                id="schedule-unpublish-at"
                type="datetime-local"
                value={unpublishAt}
                onChange={(e) => setUnpublishAt(e.target.value)}
                className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex h-9 w-full rounded-md border px-3 py-1 text-sm shadow-sm transition-colors focus-visible:ring-1 focus-visible:outline-none"
              />
            </div>
          </div>
          <DialogFooter>
            <DialogClose>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button onClick={submitSchedule} disabled={!publishAt}>
              <CalendarClock className="mr-2 size-4" />
              Schedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete document</AlertDialogTitle>
            <AlertDialogDescription>
              {refWarning && (
                <span className="mb-2 block font-medium text-amber-600 dark:text-amber-400">{refWarning}</span>
              )}
              This action cannot be undone. This will permanently delete this document.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose>
              <Button variant="outline">Cancel</Button>
            </AlertDialogClose>
            <Button variant="destructive" onClick={() => submitAction("delete")}>
              Delete
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function toLocalDatetime(iso: string): string {
  const date = new Date(iso);
  if (isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60000);
  return local.toISOString().slice(0, 16);
}
