import { createElement, type ComponentType } from "react";
import { hydrateRoot } from "react-dom/client";
import { customFields } from "virtual:kide/custom-fields";
import { AdminApp, type AppPayload, type ViewKind } from "../app/AdminApp";
import { loadView, resolveView } from "../app/views";
import { defineIslandElement } from "./island-element";
import { islands, type IslandName } from "./islands";

const CUSTOM_PREFIX = "custom:";

const loadComponent = async (name: string): Promise<ComponentType<any> | undefined> => {
  if (name.startsWith(CUSTOM_PREFIX)) return customFields[name.slice(CUSTOM_PREFIX.length)];
  const load = islands[name as IslandName];
  return load ? (await load()).default : undefined;
};

// Pages outside the app (sign-in, account, assets) still hydrate island by island.
defineIslandElement(loadComponent);

const appRoot = document.getElementById("kide-app");
const appData = document.getElementById("kide-app-data");
if (appRoot && appData) {
  const initial = JSON.parse(appData.textContent ?? "{}") as AppPayload;
  void loadView(initial.view.kind).then(() => {
    hydrateRoot(appRoot, createElement(AdminApp, { initial, resolveView, loadView }), {
      // One root renders the whole admin: rather than a blank screen after a crash, load the page fresh.
      onUncaughtError: (error) => {
        console.error("[kide] admin app crashed; reloading the page", error);
        window.location.reload();
      },
    });
    // Nearly every session opens a document: fetch the views (and the editors) while idle.
    const preload = () => (["edit", "list", "recent"] as ViewKind[]).forEach((kind) => void loadView(kind));
    if ("requestIdleCallback" in window) requestIdleCallback(preload, { timeout: 3000 });
    else setTimeout(preload, 1500);
  });
}
