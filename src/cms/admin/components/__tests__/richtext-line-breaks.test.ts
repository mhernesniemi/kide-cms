// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";

import { renderRichText } from "../../../core/values";
import { cmsNodeToTiptap, starterKitOptions, tiptapNodeToCms, type CmsNode } from "../richtext-tiptap";

const makeEditor = (children: CmsNode[]) =>
  new Editor({
    element: document.createElement("div"),
    extensions: [StarterKit.configure(starterKitOptions)],
    content: { type: "doc", content: children.map(cmsNodeToTiptap) },
  });

const save = (editor: Editor) => ({
  type: "root" as const,
  children: (editor.getJSON().content ?? []).map(tiptapNodeToCms).filter(Boolean) as CmsNode[],
});

describe("rich text line breaks", () => {
  it("keeps a Shift+Enter break through save, reload and render", () => {
    const editor = makeEditor([{ type: "paragraph", children: [{ type: "text", value: "Paragraph 1" }] }]);
    editor.commands.focus("end");
    editor.commands.setHardBreak();
    editor.commands.insertContent("Line 2");

    const saved = save(editor);
    expect(renderRichText(saved)).toBe("<p>Paragraph 1<br />Line 2</p>");

    const reloaded = makeEditor(saved.children);
    expect(reloaded.getHTML()).toBe("<p>Paragraph 1<br>Line 2</p>");
    expect(save(reloaded)).toEqual(saved);
    editor.destroy();
    reloaded.destroy();
  });

  it("loads imported \\n breaks (paragraphs, marks, list items) as hard breaks", () => {
    const editor = makeEditor([
      { type: "paragraph", children: [{ type: "text", value: "a\nb", bold: true }] },
      { type: "list", ordered: false, children: [{ type: "list-item", children: [{ type: "text", value: "x\ny" }] }] },
    ]);
    expect(editor.getHTML()).toBe("<p><strong>a</strong><br><strong>b</strong></p><ul><li><p>x<br>y</p></li></ul>");
    editor.destroy();
  });

  it("renders \\n as <br /> and still escapes text", () => {
    const html = renderRichText({
      type: "root",
      children: [{ type: "paragraph", children: [{ type: "text", value: "<b>\nok", italic: true }] }],
    });
    expect(html).toBe("<p><em>&lt;b&gt;<br />ok</em></p>");
  });
});

describe("formats the CMS AST can't store", () => {
  it("are flattened on paste instead of vanishing on save", () => {
    const editor = makeEditor([{ type: "paragraph" }]);
    editor.commands.setContent("<p><u>under</u> <s>strike</s> <code>code</code></p><hr><pre><code>block</code></pre>");

    expect(renderRichText(save(editor))).toBe("<p>under strike code</p><p>block</p>");
    editor.destroy();
  });
});
