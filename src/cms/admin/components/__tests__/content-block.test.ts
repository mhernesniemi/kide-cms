// @vitest-environment jsdom
//
// Mounts a REAL headless Tiptap editor with the inline-block node spec and exercises
// the operations that were failing in the browser: insert a block, keep typing before
// / between / after blocks, survive the HTML round-trip ProseMirror runs on drag-and-drop
// / copy-paste, and delete. This validates the editor's data model end-to-end without a
// browser driver. Regression guard for the node-name collision ("block" vs the ProseMirror
// content group "block") that corrupted the schema.

import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { Editor, Node, isNodeSelection } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";

import { blockNodeSpec, BLOCK_NODE_NAME } from "../content-block-spec";

const BlockNode = Node.create(blockNodeSpec);

const makeEditor = () =>
  new Editor({
    element: document.createElement("div"),
    extensions: [StarterKit, BlockNode],
    content: { type: "doc", content: [{ type: "paragraph" }] },
  });

const blocksOf = (editor: Editor): any[] =>
  (editor.getJSON().content ?? []).filter((n: any) => n.type === BLOCK_NODE_NAME);

// Mirrors ContentEditor.insertBlock: insert the atom block then guarantee an editable
// text block after it with the caret inside.
function insertBlock(editor: Editor, blockType: string, fields: Record<string, unknown>) {
  const content = { type: BLOCK_NODE_NAME, attrs: { blockType, fields } };
  const chain = editor.chain().focus();
  if (isNodeSelection(editor.state.selection)) chain.insertContentAt(editor.state.selection.$to.pos, content);
  else chain.insertContent(content);
  chain
    .command(({ state, tr, dispatch }) => {
      if (dispatch) {
        const { $to } = tr.selection;
        const posAfter = $to.end();
        if ($to.nodeAfter) {
          if ($to.nodeAfter.isTextblock) tr.setSelection(TextSelection.create(tr.doc, $to.pos + 1));
          else if ($to.nodeAfter.isBlock) tr.setSelection(NodeSelection.create(tr.doc, $to.pos));
          else tr.setSelection(TextSelection.create(tr.doc, $to.pos));
        } else {
          const nodeType = state.schema.nodes.paragraph ?? $to.parent.type.contentMatch.defaultType;
          const node = nodeType?.create();
          if (node) {
            tr.insert(posAfter, node);
            tr.setSelection(TextSelection.create(tr.doc, posAfter + 1));
          }
        }
      }
      return true;
    })
    .run();
}

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
