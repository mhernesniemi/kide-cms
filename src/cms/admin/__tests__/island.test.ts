// @vitest-environment jsdom
import { act, createElement, useState, type ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { defineIslandElement } from "../client/island-element";
import { Island, resetIslands } from "../render/island-server";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Renders its children only once opened — like MobileSidebar's drawer.
function Drawer({ children }: { children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  return createElement(
    "div",
    null,
    createElement("button", { id: "open", onClick: () => setOpen(true) }, "Open"),
    open ? createElement("nav", null, children) : null,
  );
}

function Counter() {
  const [count, setCount] = useState(0);
  return createElement("button", { id: "count", onClick: () => setCount(count + 1) }, `count ${count}`);
}

const components: Record<string, any> = { "custom:Drawer": Drawer, "custom:Counter": Counter };

const settle = async (predicate: () => boolean) => {
  for (let i = 0; i < 50 && !predicate(); i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
  expect(predicate()).toBe(true);
};

describe("Island", () => {
  it("keeps children a component doesn't render during SSR, and hydrates islands inside them", async () => {
    resetIslands();
    const html = renderToString(
      createElement(Island, {
        name: "custom:Drawer",
        component: Drawer,
        children: [
          createElement("a", { key: "link", href: "/admin/recent" }, "Recent"),
          createElement(Island, { key: "counter", name: "custom:Counter", component: Counter }),
        ],
      }),
    );
    document.body.innerHTML = html;
    expect(document.querySelector("nav")).toBeNull();

    defineIslandElement(async (name) => components[name]);
    await settle(() => !document.querySelector("kide-island[ssr]"));
    expect(document.querySelector("template[data-kide-slot]")).toBeNull();

    await act(async () => {
      document.querySelector<HTMLButtonElement>("#open")!.click();
    });
    expect(document.querySelector('nav a[href="/admin/recent"]')?.textContent).toBe("Recent");

    // The nested island arrived as static HTML inside the slot and hydrates on insertion.
    await settle(
      () => document.querySelectorAll("kide-island[ssr]").length === 0 && !!document.querySelector("#count"),
    );
    await act(async () => {
      document.querySelector<HTMLButtonElement>("#count")!.click();
    });
    await settle(() => document.querySelector("#count")?.textContent === "count 1");

    // Removing the islands unmounts their roots (a microtask); do it before jsdom is torn down.
    await act(async () => {
      document.body.innerHTML = "";
      await Promise.resolve();
    });
  });
});
