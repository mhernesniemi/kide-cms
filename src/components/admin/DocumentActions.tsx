"use client";

import { CheckIcon, EllipsisVertical } from "lucide-react";
import { Button } from "@/components/admin/ui/button";
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
  versions?: Version[];
  restoreEndpoint?: string;
  redirectTo?: string;
};

export default function DocumentActions({
  formId,
  showUnpublish,
  showDelete,
  versions = [],
  restoreEndpoint,
  redirectTo,
}: Props) {
  if (!showUnpublish && !showDelete && versions.length === 0) return null;

  const submitAction = (action: string) => {
    const form = document.getElementById(formId) as HTMLFormElement | null;
    if (!form) return;
    const input = form.querySelector<HTMLInputElement>('input[name="_action"]');
    if (input) input.value = action;
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
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="More actions">
          <EllipsisVertical className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {showUnpublish && <DropdownMenuItem onClick={() => submitAction("unpublish")}>Move to draft</DropdownMenuItem>}
        {sortedVersions.length > 0 && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Restore version</DropdownMenuSubTrigger>
            <DropdownMenuSubContent side="left" className="max-h-64 overflow-y-auto">
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
                    <span>v{vNum}{isCurrent ? " (current)" : ""}</span>
                    {isCurrent && <CheckIcon className="text-muted-foreground size-3.5" />}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}
        {(showUnpublish || sortedVersions.length > 0) && showDelete && <DropdownMenuSeparator />}
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
  );
}
