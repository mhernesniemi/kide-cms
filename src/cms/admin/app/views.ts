import type { ComponentType } from "react";
import type { ViewKind } from "./AdminApp";

const loaders: Record<ViewKind, (() => Promise<ComponentType<any>>) | null> = {
  recent: () => import("../views/RecentView").then((mod) => mod.RecentView),
  "needs-you": () => import("../views/NeedsYouView").then((mod) => mod.NeedsYouView),
  singles: () => import("../views/SinglesView").then((mod) => mod.SinglesView),
  denied: () => import("../views/AccessDeniedView").then((mod) => mod.AccessDeniedView),
  list: () => import("../views/ListView").then((mod) => mod.ListView),
  edit: () => import("../views/EditView").then((mod) => mod.EditView),
  assets: () => import("../views/AssetsView").then((mod) => mod.AssetsView),
  asset: () => import("../views/AssetView").then((mod) => mod.AssetView),
  account: () => import("../views/AccountView").then((mod) => mod.AccountView),
  none: null,
};

const loaded = new Map<ViewKind, ComponentType<any>>();

/** Each view is its own chunk: the list pages never download the editors. */
export const loadView = async (kind: ViewKind) => {
  const load = loaders[kind];
  if (load && !loaded.has(kind)) loaded.set(kind, await load());
};

export const resolveView = (kind: ViewKind) => loaded.get(kind) ?? null;
