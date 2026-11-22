"use client";

import { useState } from "react";
import { EllipsisVertical } from "lucide-react";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

type Props = {
  formId: string;
  language: string;
  showUnpublish?: boolean;
  showDiscard?: boolean;
};

export default function TranslationActions({ formId, language, showUnpublish, showDiscard }: Props) {
  const [deleteOpen, setDeleteOpen] = useState(false);

  const submitAction = (action: string) => {
    const form = document.getElementById(formId) as HTMLFormElement | null;
    const input = form?.querySelector<HTMLInputElement>('input[name="_action"]');
    if (!form || !input) return;
    input.value = action;
    form.submit();
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label="More translation actions">
            <EllipsisVertical className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          {showDiscard && (
            <DropdownMenuItem onClick={() => submitAction("discard-translation")}>Discard changes</DropdownMenuItem>
          )}
          {showUnpublish && (
            <DropdownMenuItem onClick={() => submitAction("unpublish-translation")}>Move to draft</DropdownMenuItem>
          )}
          {(showDiscard || showUnpublish) && <DropdownMenuSeparator />}
          <DropdownMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
            Delete {language} translation
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {language} translation</AlertDialogTitle>
            <AlertDialogDescription>
              The {language} version is removed from the site and this can't be undone. The original stays as it is.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose>
              <Button variant="outline">Cancel</Button>
            </AlertDialogClose>
            <Button variant="destructive" onClick={() => submitAction("delete-translation")}>
              Delete
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
