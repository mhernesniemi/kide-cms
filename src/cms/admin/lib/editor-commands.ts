import type { Editor } from "@tiptap/core";

/**
 * Headings are already bold; a bold mark carried over from the paragraph would
 * render heavier than the rest of the line. Toggle the heading, then clear bold
 * across every heading the selection touches (the Bold button is disabled inside
 * headings, so this is the only way a mark could get in).
 */
export const toggleHeading = (editor: Editor, level: 2 | 3) =>
  editor
    .chain()
    .focus()
    .toggleHeading({ level })
    .command(({ tr, state }) => {
      const bold = state.schema.marks.bold;
      if (!bold) return true;
      const { from, to } = tr.selection;
      tr.doc.nodesBetween(from, to, (node, pos) => {
        if (node.type.name === "heading") tr.removeMark(pos, pos + node.nodeSize, bold);
      });
      return true;
    })
    .run();
