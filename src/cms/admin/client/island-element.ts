import { createElement, type ComponentType } from "react";
import { hydrateRoot, type Root } from "react-dom/client";

/**
 * One React root per server-rendered island, mirroring the server's Island
 * component. As a custom element it hydrates on insertion and unmounts on
 * removal, so regions swapped in after a save hydrate themselves.
 */
export const defineIslandElement = (loadComponent: (name: string) => Promise<ComponentType<any> | undefined>) => {
  if (customElements.get("kide-island")) return;

  class KideIsland extends HTMLElement {
    private root: Root | null = null;
    private connected = false;

    async connectedCallback() {
      this.connected = true;
      if (this.root) return;
      const name = this.getAttribute("component") ?? "";
      // The server's copy of the children, outside the component's own markup (which may
      // not contain them). Removed before hydration so the markup matches the component.
      const template = [...this.children].find(
        (el): el is HTMLTemplateElement => el instanceof HTMLTemplateElement && el.hasAttribute("data-kide-slot"),
      );
      const slotHtml = template?.innerHTML;
      template?.remove();
      const Component = await loadComponent(name);
      if (!Component) {
        console.error(`[kide] Unknown island component "${name}".`);
        return;
      }
      if (!this.connected || this.root) return;
      const props = JSON.parse(this.getAttribute("props") ?? "{}");
      const children =
        slotHtml !== undefined
          ? createElement("kide-slot", {
              dangerouslySetInnerHTML: { __html: slotHtml },
              suppressHydrationWarning: true,
            })
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

  customElements.define("kide-island", KideIsland);
};
