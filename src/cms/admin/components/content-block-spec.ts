import { mergeAttributes } from "@tiptap/core";
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
