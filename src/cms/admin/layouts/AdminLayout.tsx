import type { ReactNode } from "react";
import { cms } from "virtual:kide/api";
import config from "virtual:kide/config";
import { collaboration } from "virtual:kide/runtime";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { icons as lucideIcons } from "lucide-react";

// Any Lucide icon, by name ("ArrowRightLeft" or "arrow-right-left"), rendered to SVG on the
// server so the full set costs the browser nothing.
const warnedIcons = new Set<string>();
const iconSvgCache = new Map<string, string>();
const navIcon = (name: string | undefined, fallback: NavItem["icon"] = { key: "layers" }): NavItem["icon"] => {
  if (!name) return fallback;
  const cached = iconSvgCache.get(name);
  if (cached) return { svg: cached };
  const pascal = name.replace(/(^|[-_\s])([a-z0-9])/g, (_, __, c: string) => c.toUpperCase());
  const icon = (lucideIcons as Record<string, any>)[name] ?? (lucideIcons as Record<string, any>)[pascal];
  if (!icon) {
    if (!warnedIcons.has(name)) {
      warnedIcons.add(name);
      console.warn(`[kide] Unknown admin icon "${name}"; see https://lucide.dev/icons for names.`);
    }
    return fallback;
  }
  const svg = renderToStaticMarkup(createElement(icon, { className: "size-4 shrink-0 stroke-1" }));
  iconSvgCache.set(name, svg);
  return { svg };
};

import { AdminShell, type NavItem, type ShellData } from "./AdminShell";
import { eligibleCollabSlugs, loadNeedsYou } from "../lib/collaboration";
import { canRead } from "../lib/access";
import { AdminAssets } from "../render/page";
import { isApprover, resolveCollaboration } from "../../core";
import type { CmsContext } from "../../routes/context";

const TZ_SCRIPT = `if (!document.cookie.includes("tz="))
  document.cookie = "tz=" + Intl.DateTimeFormat().resolvedOptions().timeZone + ";path=/;max-age=31536000";`;

const THEME_SCRIPT = `(function () {
  var t = localStorage.getItem("admin-theme") || "system";
  var dark = t === "dark" || (t === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  if (dark) document.documentElement.classList.add("dark");
})();`;

const FULLSCREEN_SCRIPT = `(function () {
  try {
    var prefix = "cms-content-fullscreen:";
    var path = location.pathname;
    for (var i = 0; i < sessionStorage.length; i++) {
      var k = sessionStorage.key(i);
      if (
        k &&
        k.indexOf(prefix) === 0 &&
        sessionStorage.getItem(k) === "1" &&
        k.slice(prefix.length).indexOf(path + ":") === 0
      ) {
        var root = document.documentElement;
        root.classList.add("cms-fullscreen-restoring");
        // Safety net: never leave the cover up if the editor fails to mount.
        setTimeout(function () {
          root.classList.remove("cms-fullscreen-restoring");
        }, 1500);
        break;
      }
    }
  } catch (e) {}
})();`;

const HYDRATION_SCRIPT = `(function () {
  // The browser entry removes \`ssr\` from an island once it hydrates; an island
  // still carrying it well after the page has loaded failed to import.
  function check() {
    var failed = document.querySelectorAll("kide-island[ssr]");
    if (failed.length === 0) return;
    var banner = document.getElementById("admin-hydration-error");
    if (banner) banner.hidden = false;
    console.error("[kide] " + failed.length + " admin editor(s) failed to hydrate.", failed);
  }
  function schedule() {
    setTimeout(check, 5000);
  }
  if (document.readyState === "complete") schedule();
  else window.addEventListener("load", schedule, { once: true });
})();`;

const SIDEBAR_SCRIPT = `(function () {
  var prefix = "cms-sidebar-group:";
  document.querySelectorAll("details[data-nav-group]").forEach(function (el) {
    var group = el.getAttribute("data-nav-group");
    if (!group) return;
    if (el.getAttribute("data-active") === "true") {
      el.open = true;
      return;
    }
    var stored = localStorage.getItem(prefix + group);
    if (stored === "open") el.open = true;
    if (stored === "closed") el.open = false;
  });
  document.addEventListener(
    "toggle",
    function (e) {
      var el = e.target instanceof HTMLDetailsElement ? e.target : null;
      if (!el || !el.matches("details[data-nav-group]")) return;
      var group = el.getAttribute("data-nav-group");
      if (!group) return;
      localStorage.setItem(prefix + group, el.open ? "open" : "closed");
    },
    true,
  );
})();`;

const SEARCH_SCRIPT = `(function () {
  document.addEventListener("click", function (e) {
    var t = e.target instanceof Element ? e.target.closest("[data-cms-search-trigger]") : null;
    if (t) window.dispatchEvent(new Event("cms:open-search"));
  });
  var isMac = /Mac|iPhone|iPad|iPod/i.test(navigator.userAgent || "");
  if (!isMac) {
    // Inside the admin app React owns this markup and swaps the label itself.
    document.querySelectorAll("[data-cms-search-kbd]").forEach(function (el) {
      if (!el.closest("#kide-app")) el.textContent = "Ctrl+K";
    });
  }
})();`;

const TOAST_SCRIPT = `(function () {
  var p = new URLSearchParams(location.search);
  var status = p.get("_toast");
  if (!status) return;
  p.delete("_toast");
  p.delete("_msg");
  // A sheet's parent reads _toast off the frame's URL to tell a save happened.
  if (window.parent === window) history.replaceState({}, "", location.pathname + (p.size ? "?" + p : ""));
  // Error toasts stay longer (5s) than success toasts (3s)
  var delay = status === "error" ? 5200 : 3200;
  setTimeout(function () {
    var el = document.getElementById("admin-toast");
    // React owns the app's toast; its animation already hides it.
    if (el && !el.closest("#kide-app")) el.remove();
  }, delay);
})();`;

type CollectionNavConfig = {
  group?: string;
  sidebar?: boolean;
  icon?: string;
  weight?: number;
};

type CollectionNavEntry = {
  slug: string;
  labels: { singular: string; plural: string };
  singleton?: boolean;
  admin?: CollectionNavConfig;
};

/** The request-dependent part of the chrome: who is signed in, badges, the toast. */
export async function loadAdminLayout({ url, locals }: Pick<CmsContext, "url" | "locals">) {
  const user = locals.user ?? null;

  // Server-side toast: read _toast/_msg params set by API redirect
  const toastStatus = url.searchParams.get("_toast") as "success" | "error" | null;
  const toastMessage =
    url.searchParams.get("_msg") ?? (toastStatus === "success" ? "Saved successfully" : "Something went wrong");

  // "Needs you" queue — the nav entry only exists when collaboration is switched on
  // for at least one readable collection, and its badge is the whole notification
  // story for now: without a count nobody visits a queue they have to remember.
  const needsYouSlugs = eligibleCollabSlugs(config, user, resolveCollaboration, canRead);
  let needsYouCount = 0;
  if (needsYouSlugs.size > 0 && user) {
    try {
      const queue = await loadNeedsYou({
        collaboration,
        userId: String(user.id),
        isApprover: isApprover(config, user.role),
        eligibleSlugs: needsYouSlugs,
      });
      needsYouCount = queue.length;
    } catch {
      // Table may not exist yet on first run — a missing badge beats a broken layout.
    }
  }

  // Unread submissions badge — shown next to "Forms" in the sidebar.
  let unreadSubmissions = 0;
  try {
    const cmsAny = cms as Record<string, any>;
    if (cmsAny["form-submissions"]) {
      unreadSubmissions = await cmsAny["form-submissions"].count({ where: { status: "new" } }, { _system: true });
    }
  } catch {
    // Table may not exist yet on first run — ignore.
  }

  return {
    user,
    toastStatus,
    toastMessage,
    hasNeedsYou: needsYouSlugs.size > 0,
    needsYouCount,
    unreadSubmissions,
    currentPath: url.pathname,
  };
}

export type AdminLayoutData = Awaited<ReturnType<typeof loadAdminLayout>>;

export type ShellOptions = {
  collections?: CollectionNavEntry[];
  activeCollection?: string | null;
  embed?: boolean;
  customNav?: Array<{ label: string; href: string; icon?: string; weight?: number }>;
};

/** Everything the chrome renders, as plain data: the browser renders it on navigation too. */
export function buildShell(layout: AdminLayoutData, options: ShellOptions = {}): ShellData {
  const { collections = [], activeCollection = null, embed = false, customNav = [] } = options;
  const { user, toastStatus, toastMessage, hasNeedsYou, needsYouCount, unreadSubmissions, currentPath } = layout;
  const librarySlugs = new Set(["shared-sections", "taxonomies", "menus", "forms", "authors"]);
  const pinnedIcons: Record<string, NavItem["icon"]> = {
    "shared-sections": { key: "link2" },
    taxonomies: { key: "folderTree" },
    menus: { key: "menu" },
    forms: { key: "messageSquare" },
    authors: { key: "pencilRuler" },
    users: { key: "users" },
  };

  const visibleCollections = collections.filter((c) => c.admin?.sidebar !== false);
  const hasSingletons = visibleCollections.some((c) => c.singleton);
  const singletonSlugs = new Set(visibleCollections.filter((c) => c.singleton).map((c) => c.slug));
  const isActiveSingles =
    activeCollection === "singles" || (activeCollection !== null && singletonSlugs.has(activeCollection));

  const fallbackGroupFor = (collection: CollectionNavEntry) => {
    if (collection.slug === "users") return "Team";
    if (librarySlugs.has(collection.slug)) return "Library";
    return "Content";
  };
  const fallbackWeightFor = (collection: CollectionNavEntry) => {
    if (collection.slug === "shared-sections") return 5;
    if (collection.slug === "taxonomies") return 20;
    if (collection.slug === "menus") return 30;
    if (collection.slug === "forms") return 40;
    if (collection.slug === "authors") return 50;
    return 10;
  };
  const groupWeightFor = (group: string) => {
    if (group === "Content") return 0;
    if (group === "Library") return 10;
    if (group === "Team") return 20;
    if (group === "Custom") return 100;
    return 50;
  };

  const navItems: Array<NavItem & { weight: number; group: string }> = [];
  if (hasNeedsYou) {
    navItems.push({
      href: "/admin/needs-you",
      label: "Needs you",
      icon: { key: "inbox" },
      active: activeCollection === "needs-you",
      badge: needsYouCount > 0 ? needsYouCount : undefined,
      badgeLabel: "open",
      weight: -10,
      group: "Content",
    });
  }
  navItems.push({
    href: "/admin/recent",
    label: "Recent",
    icon: { key: "clock" },
    active: activeCollection === "recent",
    weight: 0,
    group: "Content",
  });
  for (const c of visibleCollections.filter((c) => !c.singleton)) {
    navItems.push({
      href: `/admin/${c.slug}`,
      label: c.labels.plural,
      singularLabel: c.labels.singular,
      icon: c.admin?.icon ? navIcon(c.admin.icon) : (pinnedIcons[c.slug] ?? { key: "layers" }),
      active: activeCollection === c.slug,
      // Submissions are created by end users filling out forms, not added manually.
      newHref: c.slug === "form-submissions" ? undefined : `/admin/${c.slug}/new`,
      weight: c.admin?.weight ?? fallbackWeightFor(c),
      group: c.admin?.group ?? fallbackGroupFor(c),
      badge: c.slug === "form-submissions" && unreadSubmissions > 0 ? unreadSubmissions : undefined,
    });
  }
  if (hasSingletons) {
    navItems.push({
      href: "/admin/singles",
      label: "Singles",
      icon: { key: "fileText" },
      active: isActiveSingles,
      weight: 20,
      group: "Content",
    });
  }
  navItems.push({
    href: "/admin/assets",
    label: "Assets",
    icon: { key: "image" },
    active: activeCollection === "assets",
    weight: 40,
    group: "Library",
  });
  for (const item of customNav) {
    navItems.push({
      href: item.href,
      label: item.label,
      icon: navIcon(item.icon),
      active: currentPath === item.href || currentPath.startsWith(item.href + "/"),
      weight: item.weight ?? 50,
      group: "Custom",
    });
  }

  navItems.sort(
    (a, b) =>
      groupWeightFor(a.group) - groupWeightFor(b.group) || a.weight - b.weight || a.label.localeCompare(b.label),
  );
  const navGroups = [...new Set(navItems.map((item) => item.group))]
    .sort((a, b) => groupWeightFor(a) - groupWeightFor(b) || a.localeCompare(b))
    .map((group) => {
      const items = navItems.filter((item) => item.group === group).map(({ weight: _w, group: _g, ...item }) => item);
      const active = items.some((item) => item.active);
      const collapsed = !active && !["Content", "Library", "Team"].includes(group);
      return { group, items, active, collapsed };
    })
    .filter((entry) => entry.items.length > 0);

  return {
    user: user ? { name: String(user.name), email: String(user.email) } : null,
    toastStatus,
    toastMessage,
    embed,
    navGroups,
  };
}

/** The HTML document around every admin page: head, theme and timezone bootstrapping, assets. */
export function AdminDocument({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width" />
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <link rel="icon" href="/favicon.ico" />
        <title>{title}</title>
        <script dangerouslySetInnerHTML={{ __html: TZ_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        {/* No-flash: if a content field was in fullscreen before a save reload, cover the
            chrome until the editor re-enters fullscreen (see ContentEditor restore logic). */}
        <style>{`html.cms-fullscreen-restoring::before {
  content: "";
  position: fixed;
  inset: 0;
  background: var(--background);
  z-index: 45;
}`}</style>
        <script dangerouslySetInnerHTML={{ __html: FULLSCREEN_SCRIPT }} />
        <AdminAssets />
      </head>
      <body className="bg-background text-foreground min-h-screen antialiased">
        {children}

        {/* Shown when an editor island fails to hydrate, so a failed load never looks like empty content. */}
        <div
          id="admin-hydration-error"
          role="alert"
          hidden
          className="border-destructive/40 bg-background text-foreground fixed inset-x-4 bottom-4 z-[100] mx-auto max-w-xl rounded-lg border px-4 py-3 text-sm shadow-lg"
        >
          <p className="font-medium">Some editors failed to load.</p>
          <p className="text-muted-foreground mt-1">
            Fields may look empty, but your content is safe — don't save this page. Reload to try again.
            {import.meta.env.DEV && (
              <>
                {" "}
                If it keeps happening, stop the dev server and restart it with <code>pnpm dev:clean</code>, and check
                its log for a <code>[kide-cms]</code> warning about duplicate packages.
              </>
            )}
          </p>
        </div>
        <script dangerouslySetInnerHTML={{ __html: HYDRATION_SCRIPT }} />

        {/* Persist collapsible sidebar groups locally. Active groups always open. */}
        <script dangerouslySetInnerHTML={{ __html: SIDEBAR_SCRIPT }} />

        {/* Wire sidebar search triggers to the CommandPalette */}
        <script dangerouslySetInnerHTML={{ __html: SEARCH_SCRIPT }} />

        {/* Clean toast params from URL and remove toast element after animation */}
        <script dangerouslySetInnerHTML={{ __html: TOAST_SCRIPT }} />
      </body>
    </html>
  );
}

type AdminLayoutProps = ShellOptions & {
  layout: AdminLayoutData;
  title?: string;
  children?: ReactNode;
};

/** A full admin page outside the app router (account, asset detail, custom Astro pages). */
export function AdminLayout({ layout, title = "Admin", children, ...options }: AdminLayoutProps) {
  return (
    <AdminDocument title={title}>
      <AdminShell shell={buildShell(layout, options)}>{children}</AdminShell>
    </AdminDocument>
  );
}

/** The chrome for a page of the admin app, as data. */
export async function loadShell(context: Pick<CmsContext, "url" | "locals">, options: ShellOptions = {}) {
  return buildShell(await loadAdminLayout(context), options);
}
