import { createElement, useCallback, useEffect, useRef, useState, type ComponentType } from "react";
import { AdminShell, type ShellData } from "../layouts/AdminShell";
import { submitForm } from "../lib/navigate";
import { InAppRoot } from "../render/island";

export type ViewKind =
  "recent" | "needs-you" | "singles" | "denied" | "list" | "edit" | "assets" | "asset" | "account" | "none";

/** Everything one admin page needs, as JSON: the server sends it on first load and on navigation. */
export type AppPayload = {
  title: string;
  shell: ShellData;
  view: { kind: ViewKind; data?: unknown };
};

export type ResolveView = (kind: ViewKind) => ComponentType<any> | null;

type NavigateOptions = {
  replace?: boolean;
  keepScroll?: boolean;
  /** False keeps the mounted view (and its editors' state) and only passes it new data. */
  remount?: boolean;
};

export type KideApp = {
  navigate: (url: string, options?: NavigateOptions) => Promise<void>;
  apply: (url: string, payload: AppPayload, options?: NavigateOptions) => Promise<void>;
};

declare global {
  interface Window {
    __kideApp?: KideApp;
    /** Set by the unsaved-changes guard: true when it took over a navigation to `href`. */
    __kideGuard?: (href: string) => boolean;
  }
}

export const NAV_HEADER = "x-kide-nav";

// Query params a redirect uses to show a toast once; they never belong in the address bar.
const ONE_SHOT_PARAMS = ["_toast", "_msg", "_field"];

const cleanUrl = (href: string) => {
  const url = new URL(href, location.href);
  // Inside a sheet the parent reads them off the frame's URL to tell a save happened.
  if (window.parent === window) for (const param of ONE_SHOT_PARAMS) url.searchParams.delete(param);
  return url.pathname + url.search + url.hash;
};

const isAppLink = (event: MouseEvent): URL | null => {
  if (event.defaultPrevented || event.button !== 0) return null;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;
  const anchor = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
  if (!anchor || anchor.hasAttribute("download") || anchor.hasAttribute("data-kide-reload")) return null;
  if (anchor.target && anchor.target !== "_self") return null;
  const url = new URL(anchor.href, location.href);
  if (url.origin !== location.origin || !url.pathname.startsWith("/admin")) return null;
  // Same page, different fragment: let the browser scroll.
  if (url.pathname === location.pathname && url.search === location.search && url.hash) return null;
  return url;
};

export function AdminApp({
  initial,
  resolveView,
  loadView,
}: {
  initial: AppPayload;
  resolveView: ResolveView;
  /** Browser only: fetches a view's code before it renders. */
  loadView?: (kind: ViewKind) => Promise<unknown>;
}) {
  const [page, setPage] = useState({ payload: initial, key: 0, update: 0 });
  const navId = useRef(0);
  const currentUrl = useRef("");

  const show = useCallback(
    async (
      url: string,
      payload: AppPayload,
      { replace = false, keepScroll = false, remount = true }: NavigateOptions = {},
    ) => {
      await loadView?.(payload.view.kind);
      const target = cleanUrl(url);
      // Reaching the page you're on is a refresh, not a new history entry.
      if (replace || target === currentUrl.current) history.replaceState({ ...history.state, kide: true }, "", target);
      else history.pushState({ kide: true }, "", target);
      currentUrl.current = target;
      document.title = payload.title;
      setPage((current) => ({ payload, key: remount ? current.key + 1 : current.key, update: current.update + 1 }));
      if (!keepScroll) window.scrollTo(0, 0);
    },
    [loadView],
  );

  const navigate = useCallback(
    async (url: string, options: NavigateOptions = {}) => {
      const id = ++navId.current;
      history.replaceState({ ...history.state, scroll: window.scrollY }, "");
      let res: Response;
      try {
        res = await fetch(url, { headers: { [NAV_HEADER]: "1" }, credentials: "same-origin" });
      } catch {
        location.assign(url);
        return;
      }
      if (id !== navId.current) return;
      // Pages outside the app (sign-in, account, assets) and errors load as documents.
      if (!res.ok || !(res.headers.get("content-type") ?? "").includes("application/json")) {
        location.assign(res.url || url);
        return;
      }
      const payload = (await res.json()) as AppPayload;
      if (id !== navId.current) return;
      await show(res.url, payload, options);
    },
    [show],
  );

  useEffect(() => {
    window.__kideApp = { navigate, apply: show };
    currentUrl.current = cleanUrl(location.href);
    history.replaceState({ ...history.state, kide: true }, "", currentUrl.current);

    const onClick = (event: MouseEvent) => {
      const url = isAppLink(event);
      if (!url) return;
      event.preventDefault();
      void navigate(url.href);
    };
    const onPopState = async (event: PopStateEvent) => {
      if (window.__kideGuard?.(location.href)) {
        history.pushState({ kide: true }, "", currentUrl.current);
        return;
      }
      currentUrl.current = cleanUrl(location.href);
      const scroll = (event.state as { scroll?: number } | null)?.scroll ?? 0;
      const id = ++navId.current;
      const res = await fetch(location.href, { headers: { [NAV_HEADER]: "1" }, credentials: "same-origin" }).catch(
        () => null,
      );
      if (id !== navId.current) return;
      if (!res?.ok || !(res.headers.get("content-type") ?? "").includes("application/json")) {
        location.reload();
        return;
      }
      const payload = (await res.json()) as AppPayload;
      await loadView?.(payload.view.kind);
      if (id !== navId.current) return;
      document.title = payload.title;
      setPage((current) => ({ payload, key: current.key + 1, update: current.update + 1 }));
      requestAnimationFrame(() => window.scrollTo(0, scroll));
    };

    // Plain post forms that redirect back into the admin opt in with data-kide-submit.
    const onSubmit = (event: SubmitEvent) => {
      const form = event.target as HTMLFormElement;
      if (event.defaultPrevented || !form.hasAttribute("data-kide-submit") || window.parent !== window) return;
      event.preventDefault();
      void submitForm(form, event.submitter);
    };

    document.addEventListener("click", onClick);
    document.addEventListener("submit", onSubmit);
    window.addEventListener("popstate", onPopState);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("submit", onSubmit);
      window.removeEventListener("popstate", onPopState);
      delete window.__kideApp;
    };
  }, [navigate, show, loadView]);

  const { payload, key, update } = page;
  // Views are resolved from a static registry (loaded ahead), not created during render.
  const view = resolveView(payload.view.kind);
  return (
    <InAppRoot.Provider value={true}>
      <AdminShell shell={payload.shell} toastKey={update}>
        {view && createElement(view, { key, ...(payload.view.data as object) })}
      </AdminShell>
    </InAppRoot.Provider>
  );
}
