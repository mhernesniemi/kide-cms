"use client";

import { EllipsisVertical } from "lucide-react";
import { Button } from "@/components/admin/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/admin/ui/dropdown-menu";

type Props = {
  formId: string;
  showUnpublish?: boolean;
  showDelete?: boolean;
};

export default function DocumentActions({ formId, showUnpublish, showDelete }: Props) {
  if (!showUnpublish && !showDelete) return null;

  const submitAction = (action: string) => {
    const form = document.getElementById(formId) as HTMLFormElement | null;
    if (!form) return;
    const input = form.querySelector<HTMLInputElement>('input[name="_action"]');
    if (input) input.value = action;
    form.submit();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon-sm" aria-label="More actions">
            <EllipsisVertical className="size-4" />
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-44">
        {showUnpublish && <DropdownMenuItem onClick={() => submitAction("unpublish")}>Move to draft</DropdownMenuItem>}
        {showUnpublish && showDelete && <DropdownMenuSeparator />}
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
