if (new URLSearchParams(location.search).has("preview")) {
  const ch = new BroadcastChannel("cms-preview");
  let pending = 0;

  ch.onmessage = (e: MessageEvent) => {
    const d = e.data;

    if (d.type === "reload") {
      location.reload();
      return;
    }
    if (!d.field) return;

    const els = document.querySelectorAll<HTMLElement>(`[data-cms="${d.field}"]`);
    if (!els.length) return;

    if (d.render) {
      const id = ++pending;
      fetch("/api/cms/preview/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: d.render, data: d.value }),
      })
        .then((r) => (r.ok ? r.text() : null))
        .then((html) => {
          // Endpoint may not exist in production builds (only dev) — silently skip
          if (html != null && id === pending) els.forEach((el) => (el.innerHTML = html));
        })
        .catch(() => {});
    } else if (d.html != null) {
      els.forEach((el) => (el.innerHTML = d.html));
    } else {
      els.forEach((el) => (el.textContent = d.value));
    }
  };

  // Ask any open admin tab to replay its current (possibly unsaved) field values,
  // so a preview opened after edits were made still shows them.
  ch.postMessage({ type: "preview-ready" });
}

// --- Edit bar: "Edit this page" chip on public pages for logged-in editors ---
// Zero-cost for anonymous visitors: only acts when the non-httpOnly `kide-editor`
// hint cookie (set by the auth middleware on admin visits) is present, and only
// then verifies the real session via the edit-bar endpoint. Renders into a shadow
// root so site CSS can't leak in. Skipped in preview mode (the editor is already
// editing in another tab) and on admin pages.
if (
  !new URLSearchParams(location.search).has("preview") &&
  !location.pathname.startsWith("/admin") &&
  document.cookie.split("; ").includes("kide-editor=1")
) {
  const marker = document.querySelector("[data-cms-doc]");
  const ref = marker?.getAttribute("data-cms-doc");
  if (ref) {
    fetch(`/api/cms/edit-bar?doc=${encodeURIComponent(ref)}`)
      .then((r) => {
        if (r.status === 401) {
          // Session gone — drop the hint so future page views stay request-free.
          document.cookie = "kide-editor=; Path=/; Max-Age=0";
          return null;
        }
        return r.ok ? r.json() : null;
      })
      .then((data: { editUrl: string; status: string | null } | null) => {
        if (!data) return;
        const host = document.createElement("div");
        const shadow = host.attachShadow({ mode: "open" });
        // Static markup only — editUrl embeds a caller-suppliable document id, so
        // it goes through setAttribute, never into an HTML string.
        shadow.innerHTML = `
          <style>
            a {
              position: fixed; right: 16px; bottom: 16px; z-index: 2147483647;
              display: inline-flex; align-items: center; gap: 8px;
              padding: 8px 14px; border-radius: 999px;
              background: #18181b; color: #fafafa;
              font: 500 13px/1 system-ui, sans-serif; text-decoration: none;
              box-shadow: 0 2px 12px rgba(0, 0, 0, 0.25);
            }
            a:hover { background: #303036; }
            svg { width: 13px; height: 13px; }
          </style>
          <a>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
            </svg>
            Edit this page
          </a>`;
        shadow.querySelector("a")!.setAttribute("href", data.editUrl);
        document.body.appendChild(host);
      })
      .catch(() => {});
  }
}
