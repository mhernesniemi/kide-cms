/** Navigates inside the admin app when it's running, else loads the page. */
export const navigateTo = (href: string) => {
  if (window.__kideApp) void window.__kideApp.navigate(href);
  else window.location.assign(href);
};

/** Re-renders the current page with fresh data (after a change made through an API call). */
export const refreshPage = () => {
  const href = window.location.pathname + window.location.search;
  if (window.__kideApp) void window.__kideApp.navigate(href, { replace: true, keepScroll: true });
  else window.location.reload();
};

/**
 * Posts a form as the browser would, but inside the admin app the redirect's page renders in
 * place instead of reloading the document. Sheets (iframes) keep the native post: their parent
 * watches the frame's reloads.
 */
export const submitForm = async (form: HTMLFormElement, submitter?: HTMLElement | null) => {
  const app = window.__kideApp;
  if (!app || window.parent !== window) return form.submit();
  const data = new FormData(form);
  if (submitter instanceof HTMLButtonElement && submitter.name) data.set(submitter.name, submitter.value);
  const res = await fetch(form.action, {
    method: "POST",
    body: new URLSearchParams(data as unknown as Record<string, string>),
    headers: { "Content-Type": "application/x-www-form-urlencoded", "x-kide-nav": "1" },
    credentials: "same-origin",
  }).catch(() => null);
  if (!res) return form.submit();
  if (!(res.headers.get("content-type") ?? "").includes("application/json")) {
    window.location.assign(res.url);
    return;
  }
  const samePage = new URL(res.url).pathname === window.location.pathname;
  await app.apply(res.url, await res.json(), { replace: samePage, keepScroll: samePage });
};
