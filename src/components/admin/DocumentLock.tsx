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

  // Disable form fields when locked
  useEffect(() => {
    if (!lockedBy) return;
    const form = document.getElementById("document-form") as HTMLFormElement | null;
    if (form) {
      for (const el of form.elements) {
        (el as HTMLInputElement).disabled = true;
      }
    }
  }, [lockedBy]);

  if (!lockedBy) return null;

  return (
    <div className="bg-destructive/10 text-destructive border-destructive/20 flex items-center gap-2 rounded-md border px-4 py-3 text-sm">
      <Lock className="size-4 shrink-0" />
      <span>
        This document is currently being edited by <strong>{lockedBy}</strong>.
      </span>
    </div>
  );
}
