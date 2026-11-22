import { useEffect, useState } from "react";
import type { AppPayload } from "../../app/AdminApp";
import { Toast } from "../../components/Toast";

// Behaviour of the edit form that lives on its DOM: conditional fields, remembered field
// groups, autofocus on new documents, and saving through the admin app with errors shown
// as toasts that point at the offending field.

const FORM_ID = "document-form";

const matchesCondition = (current: string, expected: unknown) => {
  if (Array.isArray(expected)) return expected.some((value) => String(value) === current);
  if (typeof expected === "boolean") return expected ? current === "true" : current === "false" || current === "";
  return String(expected) === current;
};

const fieldValue = (form: HTMLFormElement, name: string) => {
  const escaped = CSS.escape(name);
  const radio = form.querySelector<HTMLInputElement>(`input[type="radio"][name="${escaped}"]:checked`);
  if (radio) return radio.value;
  if (form.querySelector(`input[type="radio"][name="${escaped}"]`)) return "";
  const checkbox = form.querySelector<HTMLInputElement>(`input[type="checkbox"][name="${escaped}"]`);
  if (checkbox) return checkbox.checked ? "true" : "false";
  const input = form.querySelector<HTMLInputElement>(`[name="${escaped}"]`);
  return input?.value ?? "";
};

function useConditionalFields() {
  useEffect(() => {
    const form = document.getElementById(FORM_ID) as HTMLFormElement | null;
    if (!form) return;
    const update = () => {
      for (const el of form.querySelectorAll<HTMLElement>("[data-condition-field]")) {
        const expected = JSON.parse(el.getAttribute("data-condition-value") ?? "null");
        const visible = matchesCondition(fieldValue(form, el.getAttribute("data-condition-field") ?? ""), expected);
        const target = el.parentElement?.childElementCount === 1 ? el.parentElement : el;
        target.style.display = visible ? "" : "none";
        for (const input of el.querySelectorAll<HTMLInputElement>("input, textarea, select")) input.disabled = !visible;
      }
    };
    update();
    form.addEventListener("input", update);
    form.addEventListener("change", update);
    return () => {
      form.removeEventListener("input", update);
      form.removeEventListener("change", update);
    };
  }, []);
}

// Collapsible field groups remember their open/closed state per collection and group.
function useFieldsetMemory() {
  useEffect(() => {
    const cleanups: Array<() => void> = [];
    for (const el of document.querySelectorAll<HTMLDetailsElement>("details[data-fieldset-key]")) {
      const key = `kide:fieldset:${el.getAttribute("data-fieldset-key")}`;
      try {
        const saved = localStorage.getItem(key);
        if (saved === "open") el.open = true;
        else if (saved === "closed") el.open = false;
      } catch {
        // No localStorage: the schema default stays.
      }
      const onToggle = () => {
        try {
          localStorage.setItem(key, el.open ? "open" : "closed");
        } catch {
          // Ignore.
        }
      };
      el.addEventListener("toggle", onToggle);
      cleanups.push(() => el.removeEventListener("toggle", onToggle));
    }
    return () => cleanups.forEach((cleanup) => cleanup());
  }, []);
}

const clearInvalidMarks = (form: HTMLFormElement) => {
  for (const el of form.querySelectorAll("[data-cms-invalid], [aria-invalid='true']")) {
    el.removeAttribute("data-cms-invalid");
    el.removeAttribute("aria-invalid");
  }
};

// A toast alone leaves the editor hunting for which field it means: open its group,
// scroll it into view, focus it, and mark it invalid until it's touched.
const highlightField = (form: HTMLFormElement, fieldName: string | null) => {
  clearInvalidMarks(form);
  if (!fieldName) return;
  const wrapper = form.querySelector<HTMLElement>(`[data-field-name="${CSS.escape(fieldName)}"]`);
  if (!wrapper) return;
  const group = wrapper.closest("details");
  if (group && !group.open) group.open = true;
  const control = wrapper.querySelector<HTMLElement>("input, textarea, select, [contenteditable='true']");
  // Inputs already style [aria-invalid]; composite controls get the fallback outline.
  if (control) control.setAttribute("aria-invalid", "true");
  else wrapper.setAttribute("data-cms-invalid", "");
  const clear = () => clearInvalidMarks(form);
  wrapper.addEventListener("input", clear, { once: true });
  wrapper.addEventListener("change", clear, { once: true });
  wrapper.scrollIntoView({ behavior: "smooth", block: "center" });
  if (control) setTimeout(() => control.focus({ preventScroll: true }), 300);
};

// Values a field shows after saving. JSON-backed fields (blocks, rich text, relations)
// are skipped: their serialization isn't stable across renders.
const plainValues = (data: FormData) => {
  const out: Record<string, string> = {};
  data.forEach((value, name) => {
    if (name.startsWith("_") || name === "redirectTo" || typeof value !== "string") return;
    const trimmed = value.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) return;
    out[name] = name in out ? `${out[name]}\u0000${value}` : value;
  });
  return out;
};

/** True when the server stored something other than what was typed (a hook rewrote the slug, say). */
const serverChangedValues = (submitted: FormData, payload: AppPayload) => {
  const fieldView = (payload.view.data as { fieldView?: Record<string, { value?: unknown }> } | undefined)?.fieldView;
  if (!fieldView) return false;
  for (const [name, value] of Object.entries(plainValues(submitted))) {
    const stored = fieldView[name]?.value;
    if (stored === undefined || stored === null || typeof stored === "object") continue;
    if (String(stored) !== value) return true;
  }
  return false;
};

export function EditScripts() {
  const [error, setError] = useState<{ message: string; key: number } | null>(null);
  useConditionalFields();
  useFieldsetMemory();

  useEffect(() => {
    const form = document.getElementById(FORM_ID) as HTMLFormElement | null;
    if (!form) return;
    if (location.pathname.endsWith("/new")) form.querySelector<HTMLElement>('input[type="text"], textarea')?.focus();

    const showError = (message: string, fieldName: string | null) => {
      setError({ message, key: Date.now() });
      highlightField(form, fieldName);
    };

    // The browser's bubble shows one field at a time in OS styling; keep its constraint
    // checks but report them the way the server's errors are reported.
    const reportValidity = () => {
      if (form.checkValidity()) return true;
      const invalid = form.querySelector<HTMLInputElement>(":invalid");
      if (!invalid) return false;
      const wrapper = invalid.closest("[data-field-name]");
      const label = wrapper?.querySelector("label")?.textContent?.replace(/\*/g, "").trim();
      showError(
        label ? `${label} is required.` : invalid.validationMessage,
        wrapper?.getAttribute("data-field-name") ?? null,
      );
      return false;
    };

    const onSubmit = async (event: SubmitEvent) => {
      event.preventDefault();
      if (!reportValidity()) return;
      const submitter = event.submitter as HTMLButtonElement | null;
      const data = new FormData(form);
      if (submitter?.name && submitter.value) data.set(submitter.name, submitter.value);
      const embedded = window.parent !== window;

      let res: Response;
      try {
        res = await fetch(form.action, {
          method: "POST",
          body: new URLSearchParams(data as unknown as Record<string, string>),
          // The redirect after the save answers with the next page's data.
          headers: { "Content-Type": "application/x-www-form-urlencoded", "x-kide-nav": "1" },
          credentials: "same-origin",
        });
      } catch {
        form.submit();
        return;
      }

      const url = new URL(res.url);
      if (url.searchParams.get("_toast") === "error") {
        showError(url.searchParams.get("_msg") ?? "Something went wrong", url.searchParams.get("_field"));
        return;
      }
      setError(null);
      clearInvalidMarks(form);
      const saved = url.searchParams.get("_toast") === "success";
      if (saved) {
        const previewKey = document.querySelector("[data-preview-channel]")?.getAttribute("data-preview-channel");
        if (previewKey) new BroadcastChannel(`cms-preview:${previewKey}`).postMessage({ type: "reload" });
      }
      // Created inside a sheet: the parent closes it and refreshes the label it shows.
      const createdId = embedded && saved ? url.pathname.match(/\/admin\/[^/]+\/([^/]+)/)?.[1] : undefined;
      if (createdId) {
        window.parent.postMessage({ type: "cms:created", id: createdId }, "*");
        return;
      }

      const app = window.__kideApp;
      if (!app || !(res.headers.get("content-type") ?? "").includes("application/json")) {
        window.location.assign(res.url);
        return;
      }
      const payload = (await res.json()) as AppPayload;
      // Saving an existing document keeps the editors mounted (open blocks, scroll, undo)
      // and only passes them the saved data; anything else renders the next page fresh.
      const intent = submitter?.name === "_intent" ? submitter.value : "";
      const inPlace =
        saved &&
        url.pathname === location.pathname &&
        form.querySelector<HTMLInputElement>('input[name="_action"]')?.value === "update" &&
        (intent === "save" || intent === "publish");
      // The remounted unsaved-changes guard measures "dirty" against what was saved.
      if (inPlace) (window as Window & { __kideSubmittedForm?: FormData }).__kideSubmittedForm = data;
      await app.apply(res.url, payload, {
        replace: inPlace,
        keepScroll: inPlace,
        remount: !inPlace || serverChangedValues(data, payload),
      });
    };

    // The admin's own messages replace the browser's validation bubbles.
    form.setAttribute("novalidate", "");
    form.addEventListener("submit", onSubmit);
    return () => form.removeEventListener("submit", onSubmit);
  }, []);

  return error ? <Toast key={error.key} status="error" message={error.message} /> : null;
}
