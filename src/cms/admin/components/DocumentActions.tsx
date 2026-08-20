"use client";

import { useState } from "react";
import { CalendarClock, CheckIcon, EllipsisVertical } from "lucide-react";
import { cn } from "../lib/utils";
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
  /** Overrides the reference lookup — assets report usage from a different endpoint. */
  referencesEndpoint?: string;
  /** Noun used in the delete dialog ("document", "asset", …). */
  entityLabel?: string;
  /** Adds `_force=1` to the delete submit, telling the API the warning was shown and accepted. */
  forceOnConfirm?: boolean;
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
  referencesEndpoint,
  entityLabel = "document",
  forceOnConfirm,
}: Props) {
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [refWarning, setRefWarning] = useState<{ tone: "warn" | "muted"; message: string } | null>(null);
  const [publishAt, setPublishAt] = useState(currentPublishAt ? toLocalDatetime(currentPublishAt) : "");
  const [unpublishAt, setUnpublishAt] = useState(currentUnpublishAt ? toLocalDatetime(currentUnpublishAt) : "");

  const canDuplicate = !!(showDuplicate && collectionSlug && documentId);
  const hasActions =
    canDuplicate ||
    showUnpublish ||
    showDiscardDraft ||
    showDelete ||
    showSchedule ||
    showCancelSchedule ||
    versions.length > 0;
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

  const submitAction = (action: string, force?: boolean) => {
    const form = document.getElementById(formId) as HTMLFormElement | null;
    if (!form) return;
    const input = form.querySelector<HTMLInputElement>('input[name="_action"]');
    if (input) input.value = action;
    if (force) {
      let forceInput = form.querySelector<HTMLInputElement>('input[name="_force"]');
      if (!forceInput) {
        forceInput = document.createElement("input");
        forceInput.type = "hidden";
        forceInput.name = "_force";
        form.appendChild(forceInput);
      }
      forceInput.value = "1";
    }
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

    const addInput = (name: string, value: string) => {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = name;
      input.value = value;
      form.appendChild(input);
    };

    addInput("_action", "restore");
    addInput("version", String(version));
    addInput("redirectTo", redirectTo ?? window.location.pathname + window.location.search);

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
                const endpoint =
                  referencesEndpoint ??
                  (collectionSlug && documentId ? `/api/cms/references/${collectionSlug}/${documentId}` : null);
                setDeleteOpen(true);
                if (!endpoint) return;

                // Always report the outcome. Staying silent on a failed lookup makes
                // "nothing references this" and "the check never ran" identical, which
                // is exactly how a broken reference check goes unnoticed.
                try {
                  const res = await fetch(endpoint);
                  if (!res.ok) {
                    setRefWarning({ tone: "muted", message: `Couldn't check what references this ${entityLabel}.` });
                    return;
                  }
                  const payload = await res.json();
                  const parts = summarizeRefs(payload);
                  if (parts.length > 0) {
                    setRefWarning({
                      tone: "warn",
                      message: `This ${entityLabel} is referenced by ${parts.join(", ")} — deleting it will leave those references broken. This cannot be undone.`,
                    });
                  } else if (Array.isArray(payload.incomplete) && payload.incomplete.length > 0) {
                    setRefWarning({
                      tone: "warn",
                      message: `Couldn't search ${payload.incomplete.join(", ")}, so this ${entityLabel} may still be referenced. Deleting it cannot be undone.`,
                    });
                  } else {
                    setRefWarning({
                      tone: "muted",
                      message: `Nothing references this ${entityLabel}. Deleting it cannot be undone.`,
                    });
                  }
                } catch {
                  setRefWarning({
                    tone: "muted",
                    message: `Couldn't check what references this ${entityLabel}. Deleting it cannot be undone.`,
                  });
                }
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
                data-slot="input"
                type="datetime-local"
                value={publishAt}
                onChange={(e) => setPublishAt(e.target.value)}
                className="border-input bg-background placeholder:text-muted-foreground flex h-9 w-full rounded-md border px-3 py-1 text-sm shadow-sm transition-colors"
              />
            </div>
            <div className="grid gap-2">
              <label htmlFor="schedule-unpublish-at" className="text-sm font-medium">
                Unpublish at <span className="text-muted-foreground">(optional)</span>
              </label>
              <input
                id="schedule-unpublish-at"
                data-slot="input"
                type="datetime-local"
                value={unpublishAt}
                onChange={(e) => setUnpublishAt(e.target.value)}
                className="border-input bg-background placeholder:text-muted-foreground flex h-9 w-full rounded-md border px-3 py-1 text-sm shadow-sm transition-colors"
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
            <AlertDialogTitle>Delete {entityLabel}</AlertDialogTitle>
            <AlertDialogDescription className={cn(refWarning?.tone === "warn" && "text-foreground font-medium")}>
              {refWarning?.message ?? `Deleting this ${entityLabel} cannot be undone.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose>
              <Button variant="outline">Cancel</Button>
            </AlertDialogClose>
            <Button variant="destructive" onClick={() => submitAction("delete", forceOnConfirm)}>
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

/**
 * Both reference endpoints answer "where is this used" in their own shape:
 * `/api/cms/references/*` returns pre-counted `refs`, the asset endpoint returns
 * the matching documents grouped by collection.
 */
function summarizeRefs(payload: {
  refs?: Array<{ collection: string; count: number }>;
  usage?: Array<{ collectionLabel: string; docs: unknown[] }>;
  incomplete?: string[];
}): string[] {
  if (Array.isArray(payload.usage)) {
    return payload.usage
      .filter((entry) => entry.docs.length > 0)
      .map((entry) => `${entry.docs.length} ${entry.collectionLabel.toLowerCase()}`);
  }
  if (Array.isArray(payload.refs)) {
    return payload.refs.filter((ref) => ref.count > 0).map((ref) => `${ref.count} ${ref.collection.toLowerCase()}`);
  }
  return [];
}
