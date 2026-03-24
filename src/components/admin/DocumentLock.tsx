import { useEffect, useState } from "react";
import { Lock } from "lucide-react";

const HEARTBEAT_MS = 2 * 60 * 1000;

export default function DocumentLock({ collection, documentId }: { collection: string; documentId: string }) {
  const [lockedBy, setLockedBy] = useState<string | null>(null);
  const endpoint = `/api/cms/locks/${collection}/${documentId}`;

  useEffect(() => {
    if (lockedBy) return;

    const acquire = () =>
      fetch(endpoint, { method: "POST" })
        .then((r) => r.json())
        .then((data) => {
          if (!data.acquired) setLockedBy(data.userEmail);
        })
        .catch(() => {});

    acquire();
    const interval = setInterval(acquire, HEARTBEAT_MS);

    const release = () => navigator.sendBeacon(`${endpoint}?_method=DELETE`);
    window.addEventListener("beforeunload", release);

    return () => {
      clearInterval(interval);
      window.removeEventListener("beforeunload", release);
      fetch(endpoint, { method: "DELETE" }).catch(() => {});
    };
  }, [endpoint, lockedBy]);

  // Hide edit area and buttons when locked
  useEffect(() => {
    if (!lockedBy) return;
    const editArea = document.getElementById("document-edit-area");
    if (editArea) editArea.style.display = "none";
    document.querySelectorAll<HTMLElement>('[form="document-form"], [form="translation-form"]').forEach((el) => {
      el.style.display = "none";
    });
  }, [lockedBy]);

  if (!lockedBy) return null;

  return (
    <div className="bg-destructive/10 text-destructive border-destructive/20 flex items-center gap-2 rounded-md border px-4 py-3 text-sm">
      <Lock className="size-4 shrink-0" />
      <span>
        This document is currently being edited by <strong>{lockedBy}</strong>. You cannot edit it until they are done.
      </span>
    </div>
  );
}
