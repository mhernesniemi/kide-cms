// @vitest-environment jsdom
//
// Mounts a REAL headless Tiptap editor with the inline-block node spec and exercises
// the operations that were failing in the browser: insert a block, keep typing before
// / between / after blocks, survive the HTML round-trip ProseMirror runs on drag-and-drop
// / copy-paste, and delete. This validates the editor's data model end-to-end without a
// browser driver. Regression guard for the node-name collision ("block" vs the ProseMirror
// content group "block") that corrupted the schema.

import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { Editor, Node } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";

import { blockNodeSpec, BLOCK_NODE_NAME, insertBlockNode } from "../content-block-spec";

const BlockNode = Node.create(blockNodeSpec);

const makeEditor = () =>
  new Editor({
    element: document.createElement("div"),
    extensions: [StarterKit, BlockNode],
    content: { type: "doc", content: [{ type: "paragraph" }] },
  });

const blocksOf = (editor: Editor): any[] =>
  (editor.getJSON().content ?? []).filter((n: any) => n.type === BLOCK_NODE_NAME);

// Exercise the SHARED helper the toolbar + slash menu both call.
const insertBlock = (editor: Editor, blockType: string, fields: Record<string, unknown>) =>
  insertBlockNode(editor, blockType, fields);

describe("content inline block node (headless editor)", () => {
  let editor: Editor;
  beforeEach(() => {
    editor = makeEditor();
  });
  afterEach(() => {
    editor.destroy();
  });

  it("uses a node name that does not collide with the ProseMirror content group", () => {
    // The whole feature broke when the node was named "block" — guard against regressing.
    expect(BLOCK_NODE_NAME).not.toBe("block");
    // Plain text insertion (HTML-slice path) must work with the node in the schema.
    editor.chain().focus().insertContent("hello world").run();
    expect(editor.getText()).toContain("hello world");
  });

  it("inserts a block carrying its blockType + fields, with a trailing paragraph to type in", () => {
    insertBlock(editor, "faq", { heading: "Hello" });

    const blocks = blocksOf(editor);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].attrs.blockType).toBe("faq");
    expect(blocks[0].attrs.fields).toEqual({ heading: "Hello" });

    const top = editor.getJSON().content ?? [];
    const blockIdx = top.findIndex((n: any) => n.type === BLOCK_NODE_NAME);
    expect(top[blockIdx + 1]?.type).toBe("paragraph");
  });

  it("keeps typed prose before, between, and after blocks", () => {
    editor.chain().focus().insertContent("Intro").run();
    insertBlock(editor, "faq", { heading: "Q1" });
    editor.chain().focus().insertContent("Middle").run();
    insertBlock(editor, "image", { images: [] });
    editor.chain().focus().insertContent("Outro").run();

    expect(editor.getJSON().content?.map((n: any) => n.type)).toEqual([
      "paragraph",
      BLOCK_NODE_NAME,
      "paragraph",
      BLOCK_NODE_NAME,
      "paragraph",
    ]);
    const text = editor.getText();
    expect(text).toContain("Intro");
    expect(text).toContain("Middle");
    expect(text).toContain("Outro");
    expect(blocksOf(editor)).toHaveLength(2);
  });

  it("preserves blockType + fields across the HTML round-trip used by drag/copy-paste", () => {
    insertBlock(editor, "image", { images: ["/uploads/a.jpg"] });

    const html = editor.getHTML();
    expect(html).toContain('data-block-type="image"');
    editor.commands.setContent(html);

    const blocks = blocksOf(editor);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].attrs.blockType).toBe("image");
    expect(blocks[0].attrs.fields).toEqual({ images: ["/uploads/a.jpg"] });
  });

  it("deletes the slash trigger range when inserting via the slash command", () => {
    editor.chain().focus().insertContent("hi /faq").run();
    // Slash command passes the range covering the "/faq" trigger to delete it first.
    const doc = editor.state.doc.textContent; // "hi /faq"
    const slashStart = doc.indexOf("/") + 1; // +1 for the paragraph open token
    const range = { from: slashStart, to: slashStart + "/faq".length };
    insertBlockNode(editor, "faq", { heading: "" }, range);

    expect(blocksOf(editor)).toHaveLength(1);
    expect(blocksOf(editor)[0].attrs.blockType).toBe("faq");
    // The "/faq" text must be gone; the leading "hi " prose stays.
    expect(editor.getText()).not.toContain("/faq");
    expect(editor.getText()).toContain("hi");
  });

  it("removes a block when its node range is deleted, leaving the prose intact", () => {
    editor.chain().focus().insertContent("Keep me").run();
    insertBlock(editor, "faq", { heading: "Remove me" });
    expect(blocksOf(editor)).toHaveLength(1);

    let blockPos = -1;
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === BLOCK_NODE_NAME) blockPos = pos;
    });
    expect(blockPos).toBeGreaterThanOrEqual(0);
    editor
      .chain()
      .focus()
      .deleteRange({ from: blockPos, to: blockPos + 1 })
      .run();

    expect(blocksOf(editor)).toHaveLength(0);
    expect(editor.getText()).toContain("Keep me");
  });
});
