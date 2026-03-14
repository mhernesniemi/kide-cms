"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/admin/ui/alert-dialog";
import { Button } from "@/components/admin/ui/button";

/**
 * Tracks whether the form has unsaved changes.
 * Shows a confirmation dialog when the user tries to navigate away.
 * Also prevents accidental tab/window close via beforeunload.
 */
export default function UnsavedGuard({ formId, isNew = false }: { formId: string; isNew?: boolean }) {
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const dirtyRef = useRef(false);
  const submittingRef = useRef(false);

  // Track form changes by comparing current values to initial snapshot.
  // Also toggles disabled state on save/publish submit buttons.
  useEffect(() => {
    const form = document.getElementById(formId) as HTMLFormElement | null;
    if (!form) return;

    // Submit buttons that should be disabled when there are no changes
    const submitButtons = form.ownerDocument.querySelectorAll<HTMLButtonElement>(
      `button[type="submit"][form="${formId}"]`,
    );

    const initialData = new FormData(form);
    const initialSnapshot = serializeFormData(initialData);

    const setButtonsDisabled = (disabled: boolean) => {
      submitButtons.forEach((btn) => (btn.disabled = disabled));
    };

    // New documents: buttons always enabled. Existing: disabled until changed.
    if (!isNew) {
      setButtonsDisabled(true);
    }

    const checkDirty = () => {
      const currentSnapshot = serializeFormData(new FormData(form));
      dirtyRef.current = currentSnapshot !== initialSnapshot;
      if (!isNew) {
        setButtonsDisabled(!dirtyRef.current);
      }
    };

    // Mark as clean when form is submitted
    const handleSubmit = () => {
      submittingRef.current = true;
      dirtyRef.current = false;
    };

    form.addEventListener("input", checkDirty);
    form.addEventListener("change", checkDirty);
    form.addEventListener("submit", handleSubmit);

    return () => {
      form.removeEventListener("input", checkDirty);
      form.removeEventListener("change", checkDirty);
      form.removeEventListener("submit", handleSubmit);
    };
  }, [formId, isNew]);

  // Intercept link clicks within the admin layout
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (submittingRef.current || !dirtyRef.current) return;

      const anchor = (e.target as HTMLElement).closest("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;

      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("javascript:") || anchor.target === "_blank") return;

      e.preventDefault();
      setPendingHref(href);
    };

    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, []);

  // Prevent accidental tab/window close
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current && !submittingRef.current) {
        e.preventDefault();
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  const handleDiscard = useCallback(() => {
    if (pendingHref) {
      dirtyRef.current = false;
      window.location.assign(pendingHref);
    }
  }, [pendingHref]);

  return (
    <AlertDialog open={pendingHref !== null} onOpenChange={(open) => !open && setPendingHref(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Unsaved changes</AlertDialogTitle>
          <AlertDialogDescription>
            You have unsaved changes that will be lost if you leave this page.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogClose render={<Button variant="outline" />}>Stay on page</AlertDialogClose>
          <Button variant="destructive" onClick={handleDiscard}>
            Discard changes
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Serialize FormData to a stable string for comparison, skipping system fields */
function serializeFormData(data: FormData): string {
  const entries: [string, string][] = [];
  data.forEach((value, key) => {
    if (key.startsWith("_") || key === "redirectTo") return;
    entries.push([key, String(value)]);
  });
  entries.sort((a, b) => a[0].localeCompare(b[0]));
  return entries.map(([k, v]) => `${k}=${v}`).join("&");
}
