if (new URLSearchParams(location.search).has("preview")) {
  const ch = new BroadcastChannel("cms-preview");
  let pending = 0;

  ch.onmessage = (e: MessageEvent) => {
    const d = e.data;

    if (d.type === "reload") {
      location.reload();
      return;
    }

    const els = document.querySelectorAll<HTMLElement>(`[data-cms="${d.field}"]`);
    if (!els.length) return;

    if (d.render) {
      const id = ++pending;
      fetch("/api/cms/preview/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: d.render, data: d.value }),
      })
        .then((r) => r.text())
        .then((html) => {
          if (id === pending) els.forEach((el) => (el.innerHTML = html));
        });
    } else if (d.html != null) {
      els.forEach((el) => (el.innerHTML = d.html));
    } else {
      els.forEach((el) => (el.textContent = d.value));
    }
  };
}
