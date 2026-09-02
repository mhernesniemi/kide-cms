"use client";

import { useEffect, useRef, useState } from "react";
import Image from "@tiptap/extension-image";
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import { ImageIcon, Trash2 } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import ImageBrowseDialog from "./ImageBrowseDialog";
import { cn, thumbnail } from "../lib/utils";

/**
 * Inline image in rich text / content fields. Selecting it reveals alt text,
 * replace (asset browser) and remove, so an image is editable rather than a
 * fixed blob that can only be deleted.
 */
function ImageNodeView({ node, selected, editor, updateAttributes, deleteNode }: NodeViewProps) {
  const [browseOpen, setBrowseOpen] = useState(false);
  const [focusWithin, setFocusWithin] = useState(false);
  const src = String(node.attrs.src ?? "");
  const alt = String(node.attrs.alt ?? "");
  // `selected` alone is true on page load (the initial selection lands on the first
  // block), so require focus too — a click on the image gives both.
  const active = editor.isEditable && ((selected && editor.isFocused) || focusWithin);

  // Dragging a full-size image hides the drop target under the ghost. Tiptap sets
  // the ghost to the node's DOM from React's root listener, so override it from a
  // document-level listener, which runs after it.
  const wrapperRef = useRef<HTMLDivElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDragStart = (e: DragEvent) => {
      const ghost = ghostRef.current;
      const wrapper = wrapperRef.current;
      const target = e.target as Node | null;
      // A real drag starts on Tiptap's outer node element (the wrapper's parent),
      // so accept the event from either side of the wrapper.
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
        className={cn("relative z-10 max-w-full rounded-md", active && "ring-ring/50 ring-2 ring-offset-2")}
      />
      {/* Drag ghost: setDragImage needs a rendered, in-viewport element, so it sits under the
          image. A wrapping div, not the img itself — Chrome draws a bare <img> at natural size. */}
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
          className="bg-popover mt-2 flex flex-wrap items-center gap-2 rounded-md border p-1.5 shadow-xs"
        >
          <Input
            value={alt}
            onChange={(e) => updateAttributes({ alt: e.target.value })}
            placeholder="Alt text"
            aria-label="Alt text"
            className="h-8 min-w-40 flex-1"
          />
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
        onSelect={(asset) => updateAttributes({ src: asset.url, alt: alt || asset.filename })}
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
