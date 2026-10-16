import "virtual:kide/admin-css";
import { createElement, type ComponentType } from "react";
import { hydrateRoot, type Root } from "react-dom/client";
import { customFields } from "virtual:kide/custom-fields";
import { islands, type IslandName } from "./islands";

const CUSTOM_PREFIX = "custom:";

const loadComponent = async (name: string): Promise<ComponentType<any> | undefined> => {
  if (name.startsWith(CUSTOM_PREFIX)) return customFields[name.slice(CUSTOM_PREFIX.length)];
  const load = islands[name as IslandName];
  return load ? (await load()).default : undefined;
};

/**
 * One React root per server-rendered island, mirroring the server's Island
 * component. As a custom element it hydrates on insertion and unmounts on
 * removal, so regions swapped in after a save hydrate themselves.
 */
class KideIsland extends HTMLElement {
  private root: Root | null = null;
  private connected = false;

  async connectedCallback() {
    this.connected = true;
    if (this.root) return;
    const name = this.getAttribute("component") ?? "";
    // Read before awaiting: nested islands inside the slot hydrate meanwhile.
    const slot = [...this.querySelectorAll("kide-slot")].find((el) => el.closest("kide-island") === this);
    const slotHtml = slot?.innerHTML;
    const Component = await loadComponent(name);
    if (!Component) {
      console.error(`[kide] Unknown island component "${name}".`);
      return;
    }
    if (!this.connected || this.root) return;
    const props = JSON.parse(this.getAttribute("props") ?? "{}");
    const children =
      slotHtml !== undefined
        ? createElement("kide-slot", { dangerouslySetInnerHTML: { __html: slotHtml }, suppressHydrationWarning: true })
        : undefined;
    this.root = hydrateRoot(this, createElement(Component, props, children), {
      identifierPrefix: this.getAttribute("prefix") ?? undefined,
    });
    this.removeAttribute("ssr");
  }

  disconnectedCallback() {
    this.connected = false;
    // Deferred: a move within the document disconnects and reconnects synchronously.
    queueMicrotask(() => {
      if (this.connected || !this.root) return;
      this.root.unmount();
      this.root = null;
    });
  }
}

if (!customElements.get("kide-island")) customElements.define("kide-island", KideIsland);
