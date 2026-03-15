"use client";

import { useState } from "react";
import { CalendarClock, CheckIcon, EllipsisVertical } from "lucide-react";
import { Button } from "@/components/admin/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/admin/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/admin/ui/dropdown-menu";

type Version = {
  version: number;
  createdAt: string;
};

type Props = {
  formId: string;
  showUnpublish?: boolean;
  showDelete?: boolean;
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
  showUnpublish,
  showDelete,
  showSchedule,
  showCancelSchedule,
  currentPublishAt,
  currentUnpublishAt,
  versions = [],
  restoreEndpoint,
  redirectTo,
}: Props) {
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [publishAt, setPublishAt] = useState(currentPublishAt ? toLocalDatetime(currentPublishAt) : "");
  const [unpublishAt, setUnpublishAt] = useState(currentUnpublishAt ? toLocalDatetime(currentUnpublishAt) : "");

  const hasActions = showUnpublish || showDelete || showSchedule || showCancelSchedule || versions.length > 0;
  if (!hasActions) return null;

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
          {showSchedule && (
            <DropdownMenuItem onClick={() => setScheduleOpen(true)}>
              <CalendarClock className="mr-2 size-4" />
              Schedule publish
            </DropdownMenuItem>
          )}
          {showCancelSchedule && (
            <DropdownMenuItem onClick={() => submitAction("unpublish")}>Cancel schedule</DropdownMenuItem>
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
              onClick={() => {
                if (confirm("Are you sure you want to delete this document?")) {
                  submitAction("delete");
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
