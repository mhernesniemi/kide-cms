"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import type { Editor } from "@tiptap/core";
import Image from "@tiptap/extension-image";
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import { ImageIcon, Pencil, Trash2 } from "lucide-react";
import { Button } from "./ui/button";
import AssetEditSheet from "./AssetEditSheet";
import ImageBrowseDialog from "./ImageBrowseDialog";
import { cn, thumbnail } from "../lib/utils";

/**
 * Node views only re-render on node/selection changes, so track editor focus
 * ourselves. A blur whose focus lands inside `within` (the node's own toolbar)
 * is ignored: in Chrome a mousedown on a button moves focus there before the
 * click fires, and dropping `focused` at that point would unmount the toolbar
 * under the pointer, so the click never happens.
 */
function useEditorFocus(editor: Editor, within: RefObject<HTMLElement | null>) {
  const [focused, setFocused] = useState(editor.isFocused);
  useEffect(() => {
    const on = () => setFocused(true);
    const off = ({ event }: { event: FocusEvent }) => {
      const next = event.relatedTarget as Node | null;
      if (next && within.current?.contains(next)) return;
      setFocused(false);
    };
    editor.on("focus", on);
    editor.on("blur", off);
    return () => {
      editor.off("focus", on);
      editor.off("blur", off);
    };
  }, [editor, within]);
  return focused;
}

/**
 * Inline image in rich text / content fields. Selecting it reveals edit (the asset's
 * own edit view, where alt text and focal point live), replace, and remove.
 */
function ImageNodeView({ node, selected, editor, getPos, updateAttributes, deleteNode }: NodeViewProps) {
  const [browseOpen, setBrowseOpen] = useState(false);
  const [editAssetId, setEditAssetId] = useState<string | null>(null);
  const [focusWithin, setFocusWithin] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const focused = useEditorFocus(editor, wrapperRef);
  const src = String(node.attrs.src ?? "");
  const alt = String(node.attrs.alt ?? "");
  const isUpload = src.startsWith("/uploads/");

  const openEdit = () => {
    fetch(`/api/cms/assets?url=${encodeURIComponent(src)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((asset) => {
        if (asset?._id) setEditAssetId(asset._id);
      })
      .catch(() => {});
  };

  // On load the initial selection sits on the first block, so `selected` alone
  // would show the controls before anyone clicked — require editor focus too.
  const active = editor.isEditable && ((selected && focused) || focusWithin);

  // A click on a non-editable node view doesn't focus the editor by itself.
  // Focus synchronously: the async `focus()` command re-syncs the selection
  // from the DOM afterwards and would undo the node selection.
  const select = () => {
    const pos = getPos();
    if (typeof pos !== "number") return;
    editor.view.focus();
    editor.commands.setNodeSelection(pos);
  };

  // Dragging a full-size image hides the drop target under the ghost. Chrome
  // draws a bare <img> at natural size, so the ghost is a sized div. A real drag
  // starts on Tiptap's outer node element (the wrapper's parent), and Tiptap
  // sets its own ghost from React's root listener — override from the document.
  const ghostRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDragStart = (e: DragEvent) => {
      const ghost = ghostRef.current;
      const wrapper = wrapperRef.current;
      const target = e.target as Node | null;
      if (!ghost || !wrapper || !target || !e.dataTransfer) return;
      if (!wrapper.contains(target) && !target.contains(wrapper)) return;
      e.dataTransfer.setDragImage(ghost, ghost.offsetWidth / 2, ghost.offsetHeight / 2);
    };
    document.addEventListener("dragstart", onDragStart);
    return () => document.removeEventListener("dragstart", onDragStart);
  }, []);

  return (
    <NodeViewWrapper
      ref={wrapperRef}
      className="relative isolate my-3"
      data-drag-handle
      onFocusCapture={() => setFocusWithin(true)}
      onBlurCapture={(e: React.FocusEvent<HTMLDivElement>) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocusWithin(false);
      }}
    >
      <img
        src={src}
        alt={alt}
        draggable={false}
        onClick={select}
        className={cn("relative z-10 max-w-full rounded-md", active && "ring-ring/50 ring-2 ring-offset-2")}
      />
      <div
        ref={ghostRef}
        aria-hidden
        className="pointer-events-none absolute top-0 left-0 z-0 w-40 max-w-full overflow-hidden rounded-md"
      >
        <img src={thumbnail(src, 320)} alt="" className="block w-full" />
      </div>
      {active && (
        <div
          contentEditable={false}
          className="bg-popover mt-2 flex flex-wrap items-center justify-end gap-2 rounded-md border p-1.5 shadow-xs"
        >
          {isUpload && (
            <Button type="button" variant="outline" size="sm" onClick={openEdit}>
              <Pencil className="size-3.5" />
              Edit
            </Button>
          )}
          <Button type="button" variant="outline" size="sm" onClick={() => setBrowseOpen(true)}>
            <ImageIcon className="size-3.5" />
            Replace
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={deleteNode}>
            <Trash2 className="size-3.5" />
            Remove
          </Button>
        </div>
      )}
      <ImageBrowseDialog
        open={browseOpen}
        onOpenChange={setBrowseOpen}
        onSelect={(asset) => updateAttributes({ src: asset.url, alt: asset.alt ?? "" })}
      />
      <AssetEditSheet
        assetId={editAssetId}
        open={editAssetId !== null}
        onOpenChange={(open) => {
          if (!open) setEditAssetId(null);
        }}
        onDeleted={deleteNode}
      />
    </NodeViewWrapper>
  );
}

/** `@tiptap/extension-image` with the editable node view attached. */
export const EditorImage = Image.extend({
  addNodeView() {
    return ReactNodeViewRenderer(ImageNodeView);
  },
});
