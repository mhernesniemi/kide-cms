import "virtual:kide/admin-css";
import { createElement } from "react";
import { hydrateRoot, type Root } from "react-dom/client";

const islands: Record<string, () => Promise<{ default: React.ComponentType<any> }>> = {
  ColorField: () => import("../components/ColorField"),
};

class KideIsland extends HTMLElement {
  root: Root | null = null;
  async connectedCallback() {
    const name = this.getAttribute("component")!;
    const props = JSON.parse(this.getAttribute("props") ?? "{}");
    const mod = await islands[name]();
    this.root = hydrateRoot(this, createElement(mod.default, props));
    this.removeAttribute("ssr");
  }
  disconnectedCallback() {
    this.root?.unmount();
  }
}
customElements.define("kide-island", KideIsland);
