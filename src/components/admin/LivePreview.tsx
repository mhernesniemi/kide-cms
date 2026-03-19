"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PanelRight, PanelRightClose, ArrowUpRight, RefreshCw } from "lucide-react";

type Props = {
  previewUrl: string;
  formId: string;
  fieldNames: string[];
};

export default function LivePreview({ previewUrl, formId, fieldNames }: Props) {
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem("cms-preview-open") === "1";
    } catch {
      return false;
    }
  });
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const readyRef = useRef(false);
  const lastSnapshotRef = useRef<string>("");
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

  // Find the portal target on mount
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPortalTarget(document.getElementById("preview-pane"));
  }, []);

  // Persist preference
  useEffect(() => {
    try {
      localStorage.setItem("cms-preview-open", open ? "1" : "0");
    } catch {}
  }, [open]);

  // Toggle preview class on <html>, main, and the preview pane
  const closeTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const isInitialRef = useRef(true);

  useEffect(() => {
    const pane = document.getElementById("preview-pane");
    if (!pane) return;
    const shell = document.getElementById("admin-shell") ?? pane.closest("[style*='grid-template']");
    const skipTransition = isInitialRef.current && open;
    isInitialRef.current = false;

    if (skipTransition) {
      // On mount with preview already open — apply instantly, no animation
      if (shell) shell.style.transition = "none";
      pane.style.transition = "none";
      document.documentElement.classList.add("preview-open");
      pane.classList.add("preview-active");
      // Re-enable transitions next frame
      requestAnimationFrame(() => {
        if (shell) shell.style.transition = "";
        pane.style.transition = "";
      });
    } else if (open) {
      clearTimeout(closeTimerRef.current);
      document.documentElement.classList.add("preview-open");
      requestAnimationFrame(() => {
        pane.classList.add("preview-active");
      });
    } else {
      document.documentElement.classList.add("preview-closing");
      pane.classList.remove("preview-active");
      closeTimerRef.current = setTimeout(() => {
        document.documentElement.classList.remove("preview-open", "preview-closing");
      }, 150);
    }
  }, [open]);

  // Cleanup only on unmount
  useEffect(() => {
    return () => {
      clearTimeout(closeTimerRef.current);
      const pane = document.getElementById("preview-pane");
      document.documentElement.classList.remove("preview-open", "preview-closing");
      pane?.classList.remove("preview-active");
    };
  }, []);

  // Collect form state and post to iframe
  const sendUpdate = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow || !readyRef.current) return;

    const form = document.getElementById(formId) as HTMLFormElement | null;
    if (!form) return;

    const fields: Record<string, string> = {};
    for (const name of fieldNames) {
      const el = form.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${name}"]`);
      if (el) fields[name] = el.value;
    }

    const snapshot = JSON.stringify(fields);
    if (snapshot === lastSnapshotRef.current) return;
    lastSnapshotRef.current = snapshot;

    iframe.contentWindow.postMessage({ type: "cms:preview-update", fields }, window.location.origin);
  }, [formId, fieldNames]);

  // Listen for ready signal from iframe + form changes
  useEffect(() => {
    if (!open) {
      readyRef.current = false;
      lastSnapshotRef.current = "";
      return;
    }

    const handleMessage = (e: MessageEvent) => {
      if (e.data?.type === "cms:preview-ready") {
        readyRef.current = true;
        sendUpdate();
      }
    };
    window.addEventListener("message", handleMessage);

    const form = document.getElementById(formId) as HTMLFormElement | null;
    if (!form) return () => window.removeEventListener("message", handleMessage);

    const handleChange = () => sendUpdate();
    form.addEventListener("input", handleChange);
    form.addEventListener("change", handleChange);

    // Poll for hidden input changes (React sets .value property, not attribute)
    const intervalId = setInterval(sendUpdate, 300);

    return () => {
      window.removeEventListener("message", handleMessage);
      form.removeEventListener("input", handleChange);
      form.removeEventListener("change", handleChange);
      clearInterval(intervalId);
    };
  }, [open, formId, sendUpdate]);

  const handleRefresh = () => {
    readyRef.current = false;
    lastSnapshotRef.current = "";
    iframeRef.current?.contentWindow?.location.reload();
  };

  return (
    <>
      {/* Desktop: toggle split panel */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-foreground/70 hover:text-foreground hidden items-center gap-1 text-sm transition-colors lg:flex"
        title={open ? "Close preview" : "Open preview"}
      >
        {open ? <PanelRightClose className="size-4" /> : <PanelRight className="size-4" />}
        Preview
      </button>
      {/* Mobile: open in new tab */}
      <a
        href={previewUrl}
        target="_blank"
        className="text-foreground/70 hover:text-foreground flex items-center gap-1 text-sm transition-colors lg:hidden"
      >
        <ArrowUpRight className="size-4" />
        Preview
      </a>

      {open &&
        portalTarget &&
        createPortal(
          <div className="bg-background flex h-full flex-col border-l">
            <div className="bg-muted/40 flex items-center gap-2 border-b px-3 py-1.5">
              <span className="text-muted-foreground flex-1 truncate font-mono text-xs">{previewUrl}</span>
              <button
                type="button"
                onClick={handleRefresh}
                className="text-muted-foreground hover:text-foreground p-1 transition-colors"
                title="Refresh preview"
              >
                <RefreshCw className="size-3.5" />
              </button>
              <a
                href={previewUrl}
                target="_blank"
                className="text-muted-foreground hover:text-foreground p-1 transition-colors"
                title="Open in new tab"
              >
                <ArrowUpRight className="size-3.5" />
              </a>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-muted-foreground hover:text-foreground p-1 transition-colors"
                title="Close preview"
              >
                <PanelRightClose className="size-3.5" />
              </button>
            </div>
            <iframe ref={iframeRef} src={previewUrl} className="flex-1 border-0" title="Live preview" />
          </div>,
          portalTarget,
        )}
    </>
  );
}
