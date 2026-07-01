import { mergeAttributes, isNodeSelection, type Editor } from "@tiptap/core";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import type { BlockTypesMeta, RelationOption } from "./block-fields";

/**
 * Schema/serialization spec for the inline `content` block node — kept free of React
 * so it can be unit-tested against a headless Tiptap editor. ContentEditor.tsx spreads
 * this into `Node.create({ ...blockNodeSpec, addNodeView })` to attach the React view.
 *
 * The per-attribute parse/render keep `blockType` + `fields` intact across the HTML
 * round-trip ProseMirror performs on drag-and-drop and copy/paste.
 */

// NOTE: must NOT be "block" — that collides with the ProseMirror content-group name
// "block" used in node content expressions (e.g. the doc's "block+"), which corrupts
// the schema and breaks text insertion. Use a distinct node name.
export const BLOCK_NODE_NAME = "cmsBlock";

// Discriminator for a shared-section reference block (mirrors core's SHARED_BLOCK_TYPE).
// Kept here so client components avoid importing the server-side `@/cms/core` barrel.
export const SHARED_BLOCK_TYPE = "__shared";

export type BlockNodeOptions = {
  types: BlockTypesMeta;
  blockRelationOptions: Record<string, RelationOption[]>;
  /** Name of the `content` field this editor belongs to — namespaces relation-option keys. */
  fieldName: string;
};

export const blockNodeSpec = {
  name: BLOCK_NODE_NAME,
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,

  addOptions(): BlockNodeOptions {
    return { types: {}, blockRelationOptions: {}, fieldName: "" };
  },

  addAttributes() {
    return {
      blockType: {
        default: "",
        parseHTML: (el: HTMLElement) => el.getAttribute("data-block-type") || "",
        renderHTML: (attrs: Record<string, unknown>) =>
          attrs.blockType ? { "data-block-type": String(attrs.blockType) } : {},
      },
      fields: {
        default: {},
        parseHTML: (el: HTMLElement) => {
          try {
            return JSON.parse(el.getAttribute("data-fields") || "{}");
          } catch {
            return {};
          }
        },
        renderHTML: (attrs: Record<string, unknown>) => ({ "data-fields": JSON.stringify(attrs.fields ?? {}) }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-cms-block]" }];
  },

  renderHTML({ HTMLAttributes }: { HTMLAttributes: Record<string, unknown> }) {
    return ["div", mergeAttributes({ "data-cms-block": "" }, HTMLAttributes)] as const;
  },
};

/**
 * Insert an inline component block, then guarantee an editable text block follows it with
 * the caret inside — mirroring Tiptap's own setHorizontalRule so an atom block never leaves
 * the user stranded with nowhere to type. Pass `range` to first delete a slash trigger.
 * Shared by the toolbar "+ Block" inserter and the slash command.
 */
export function insertBlockNode(
  editor: Editor,
  blockType: string,
  fields: Record<string, unknown>,
  range?: { from: number; to: number },
) {
  const content = { type: BLOCK_NODE_NAME, attrs: { blockType, fields } };
  const chain = editor.chain().focus();
  if (range) chain.deleteRange(range).insertContent(content);
  else if (isNodeSelection(editor.state.selection)) chain.insertContentAt(editor.state.selection.$to.pos, content);
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
        tr.scrollIntoView();
      }
      return true;
    })
    .run();
}
