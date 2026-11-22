// @vitest-environment jsdom
import { act, createElement } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import ContentEditor from "../components/ContentEditor";
import RichTextEditor from "../components/RichTextEditor";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const text = (value: string) => ({ type: "text", value });
const doc = {
  type: "root",
  children: [
    { type: "heading", level: 2, children: [text("Opening heading")] },
    { type: "paragraph", children: [text("First paragraph.")] },
    { type: "block", blockType: "hero", fields: { title: "Hero title" } },
  ],
};
const types = { hero: { title: { type: "text", label: "Title" } } } as never;

afterEach(() => {
  document.body.innerHTML = "";
});

// SSR and the first client render both precede the editor; they must match exactly.
const hydrate = async (element: ReturnType<typeof createElement>) => {
  const container = document.createElement("div");
  container.innerHTML = renderToString(element);
  document.body.append(container);
  const ssrHtml = container.innerHTML;
  const errors = vi.fn();
  let root: ReturnType<typeof hydrateRoot> | undefined;
  await act(async () => {
    root = hydrateRoot(container, element, { onRecoverableError: errors });
  });
  return { ssrHtml, errors, unmount: () => act(() => root?.unmount()) };
};

describe("editor first paint", () => {
  it("server-renders rich text content before the editor mounts", async () => {
    const element = createElement(RichTextEditor, { name: "body", initialValue: JSON.stringify(doc) });
    const { ssrHtml, errors, unmount } = await hydrate(element);
    expect(ssrHtml).toContain("<h2>Opening heading</h2>");
    expect(ssrHtml).toContain("<p>First paragraph.</p>");
    expect(errors).not.toHaveBeenCalled();
    await unmount();
  });

  it("server-renders content prose and block headers before the editor mounts", async () => {
    const element = createElement(ContentEditor, { name: "body", initialValue: JSON.stringify(doc), types });
    const { ssrHtml, errors, unmount } = await hydrate(element);
    expect(ssrHtml).toContain("<h2>Opening heading</h2>");
    expect(ssrHtml).toContain("Hero");
    expect(ssrHtml).toContain("Hero title");
    expect(errors).not.toHaveBeenCalled();
    await unmount();
  });
});
