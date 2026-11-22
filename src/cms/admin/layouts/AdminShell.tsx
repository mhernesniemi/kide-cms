import { useSyncExternalStore, type ReactNode } from "react";
import {
  ChevronDown,
  Clock,
  FileText,
  FolderTree,
  Image,
  Inbox,
  Layers,
  Link2,
  Menu,
  MessageSquare,
  PencilRuler,
  Plus,
  Search,
  Users,
} from "lucide-react";

import CommandPalette from "../components/CommandPalette";
import MobileSidebar from "../components/MobileSidebar";
import SidebarUserMenu from "../components/SidebarUserMenu";
import { Toast } from "../components/Toast";
import { cn } from "../lib/utils";
import { Island } from "../render/island";

export const NAV_ICONS = {
  clock: Clock,
  fileText: FileText,
  folderTree: FolderTree,
  image: Image,
  inbox: Inbox,
  layers: Layers,
  link2: Link2,
  menu: Menu,
  messageSquare: MessageSquare,
  pencilRuler: PencilRuler,
  users: Users,
};

export type NavItem = {
  href: string;
  label: string;
  singularLabel?: string;
  /** A built-in icon, or server-rendered SVG markup for a configured Lucide icon. */
  icon: { key: keyof typeof NAV_ICONS } | { svg: string };
  active: boolean;
  newHref?: string;
  badge?: number;
  /** Word after the count. "new" suits an inbox of arrivals; a work queue is not new. */
  badgeLabel?: string;
};

export type ShellData = {
  user: { name: string; email: string } | null;
  toastStatus: "success" | "error" | null;
  toastMessage: string;
  embed: boolean;
  navGroups: Array<{ group: string; items: NavItem[]; active: boolean; collapsed: boolean }>;
};

const noSubscribe = () => () => {};
const isMac = () => /Mac|iPhone|iPad|iPod/i.test(navigator.userAgent || "");

// The server can't know the platform: it renders the Mac label, and hydration switches it.
function SearchKbd() {
  const mac = useSyncExternalStore(noSubscribe, isMac, () => true);
  return (
    <kbd
      data-cms-search-kbd
      className="text-foreground/45 inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-sans text-[12px] leading-none font-medium"
    >
      {mac ? (
        <>
          <span className="text-[13px] leading-none">⌘</span>
          <span>K</span>
        </>
      ) : (
        "Ctrl+K"
      )}
    </kbd>
  );
}

function NavIcon({ icon }: { icon: NavItem["icon"] }) {
  if ("svg" in icon) {
    return <span className="flex size-4 shrink-0 [&_svg]:size-4" dangerouslySetInnerHTML={{ __html: icon.svg }} />;
  }
  const Icon = NAV_ICONS[icon.key] ?? Layers;
  return <Icon className="size-4 shrink-0 stroke-1" />;
}

/** The admin chrome: sidebar, mobile header, command palette, toast. Pure render of `shell`. */
export function AdminShell({
  shell,
  toastKey,
  children,
}: {
  shell: ShellData;
  /** Changes per navigation, so a toast arriving with the next page replays its animation. */
  toastKey?: number;
  children?: ReactNode;
}) {
  const { user, toastStatus, toastMessage, embed, navGroups } = shell;

  const renderNav = (mobile: boolean) => (
    <nav className="flex-1 space-y-2 overflow-y-auto px-3 py-3">
      {navGroups.map(({ group, items, active, collapsed }) => (
        <details
          key={group}
          className="group/nav-section space-y-1"
          data-nav-group={group}
          data-active={active ? "true" : "false"}
          open={!collapsed}
        >
          <summary
            className={cn(
              "hover:text-foreground flex cursor-pointer list-none items-center justify-between rounded-md px-3 py-1 text-[11px] font-medium tracking-wide uppercase transition-colors marker:hidden [&::-webkit-details-marker]:hidden",
              mobile ? "text-muted-foreground/70" : "text-muted-foreground/80",
            )}
          >
            <span>{group}</span>
            <ChevronDown
              className={cn(mobile ? "size-3" : "size-3.5", "transition-transform group-open/nav-section:rotate-180")}
            />
          </summary>
          {items.map((item) => (
            <div
              key={item.href}
              className={cn(
                "group relative rounded-lg",
                item.active ? "bg-foreground/10 dark:bg-accent" : "hover:bg-foreground/5 dark:hover:bg-accent/60",
              )}
            >
              <a
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 text-sm",
                  mobile ? "py-2.5" : "py-1.5",
                  item.newHref && "pr-8",
                  item.active ? "text-accent-foreground" : "text-foreground/70 group-hover:text-foreground",
                )}
              >
                <NavIcon icon={item.icon} />
                <span className="flex-1">{item.label}</span>
                {item.badge ? (
                  <span className="text-muted-foreground/80 text-xs tabular-nums">
                    {item.badge > 99 ? "99+" : item.badge} {item.badgeLabel ?? "new"}
                  </span>
                ) : null}
              </a>
              {item.newHref && (
                <a
                  href={item.newHref}
                  title={`Add new ${(item.singularLabel ?? item.label).toLowerCase()}`}
                  className="text-foreground/40 hover:text-foreground/70 absolute top-1/2 right-1.5 hidden -translate-y-1/2 rounded p-1 group-hover:block"
                >
                  <Plus className="size-3.5" />
                </a>
              )}
            </div>
          ))}
        </details>
      ))}
    </nav>
  );

  const userMenu = user && (
    <Island
      name="SidebarUserMenu"
      component={SidebarUserMenu}
      props={{ userName: user.name, userEmail: user.email, logoutAction: "/api/cms/auth/logout" }}
    />
  );

  return (
    <>
      <Island name="CommandPalette" component={CommandPalette} />
      {embed ? (
        <main className="mx-auto w-full px-4 py-6 lg:px-8 lg:py-8">{children}</main>
      ) : (
        <div
          className="min-h-screen min-[1400px]:grid"
          style={{ gridTemplateColumns: "17rem 1fr", transition: "grid-template-columns 150ms ease" }}
        >
          {/* ── Desktop sidebar ──────────────────────────────────────────── */}
          <aside className="bg-sidebar/40 sticky top-0 mt-1 hidden h-screen overflow-hidden border-r backdrop-blur transition-transform duration-150 ease-in-out min-[1400px]:flex min-[1400px]:flex-col">
            <div className="px-3 pt-4 pb-1">
              <button
                type="button"
                data-cms-search-trigger
                data-slot="button"
                className="bg-background/60 hover:bg-background border-input text-muted-foreground hover:text-foreground/90 flex w-full items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors hover:cursor-text"
                aria-label="Search content"
              >
                <Search className="size-4 shrink-0 stroke-1" />
                <span className="flex-1 text-left">Search…</span>
                <SearchKbd />
              </button>
            </div>

            {renderNav(false)}
            <div className="border-t px-3 pt-2 pb-2">{userMenu}</div>
          </aside>

          <div className="min-w-0">
            {/* ── Mobile header ────────────────────────────────────────── */}
            <header className="bg-background/95 supports-backdrop-filter:bg-background/75 flex items-center gap-3 border-b px-4 py-3 backdrop-blur min-[1400px]:hidden">
              <Island name="MobileSidebar" component={MobileSidebar}>
                <div className="px-3 pt-4 pb-1">
                  <button
                    type="button"
                    data-cms-search-trigger
                    data-slot="button"
                    className="bg-background/60 hover:bg-background border-input text-muted-foreground hover:text-foreground flex w-full items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors"
                    aria-label="Search content"
                  >
                    <Search className="size-4 shrink-0 stroke-1" />
                    <span className="flex-1 text-left">Search…</span>
                  </button>
                </div>

                {renderNav(true)}
                <div className="border-t px-3 py-2">{userMenu}</div>
              </Island>
            </header>

            <main className="mx-auto w-full max-w-[1900px]">{children}</main>
          </div>
        </div>
      )}

      {toastStatus && <Toast key={toastKey} status={toastStatus} message={toastMessage} />}
    </>
  );
}
