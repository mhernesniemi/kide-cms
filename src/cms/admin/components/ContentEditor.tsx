import { useEditor, EditorContent, NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { Node } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Bold, ChevronRight, GripVertical, Italic, Heading2, Heading3, Link as LinkIcon, Trash2 } from "lucide-react";
import { Button } from "./ui/button";
import { cn } from "../lib/utils";
import {
  LinkDialog,
  fetchLinkGroups,
  cmsNodeToTiptap,
  tiptapNodeToCms,
  type CmsNode,
  type LinkGroup,
} from "./RichTextEditor";
import { SubField, humanize, type BlockTypesMeta, type RelationOption, type SubFieldMeta } from "./block-fields";
import { blockNodeSpec, BLOCK_NODE_NAME, type BlockNodeOptions } from "./content-block-spec";
import { SlashCommand } from "./slash-command";

// -----------------------------------------------
// Content AST ↔ Tiptap JSON conversion
//
// A `content` document is a rich-text document whose children may also be inline
// component blocks: { type: "block", blockType, fields }. Prose nodes reuse the
// RichTextEditor converters; block nodes map to a custom Tiptap node.
// -----------------------------------------------

type ContentBlock = { type: "block"; blockType: string; fields: Record<string, unknown>; _key?: string };
type ContentNode = CmsNode | ContentBlock;
type ContentDocument = { type: "root"; children: ContentNode[] };

const isBlock = (node: ContentNode): node is ContentBlock => node.type === "block";

const contentToTiptap = (doc: ContentDocument | null | undefined): any => {
  if (!doc || doc.type !== "root") return { type: "doc", content: [{ type: "paragraph" }] };
  // CMS stores inline blocks as `{ type: "block", ... }`; the Tiptap node is named
  // BLOCK_NODE_NAME (NOT "block" — that collides with ProseMirror's content group).
  const content = doc.children
    .map((node) =>
      isBlock(node)
        ? { type: BLOCK_NODE_NAME, attrs: { blockType: node.blockType, fields: node.fields ?? {} } }
        : cmsNodeToTiptap(node as CmsNode),
    )
    .filter(Boolean);
  return { type: "doc", content: content.length > 0 ? content : [{ type: "paragraph" }] };
};

const tiptapToContent = (json: any): ContentDocument => ({
  type: "root",
  children: (json.content ?? [])
    .map((node: any): ContentNode | null =>
      node.type === BLOCK_NODE_NAME
        ? { type: "block", blockType: node.attrs?.blockType ?? "", fields: node.attrs?.fields ?? {} }
        : (tiptapNodeToCms(node) as ContentNode | null),
    )
    .filter(Boolean),
});

// -----------------------------------------------
// Inline block node view
// -----------------------------------------------

function BlockNodeView(props: NodeViewProps) {
  const { node, updateAttributes, deleteNode, extension, selected } = props;
  const options = extension.options as BlockNodeOptions;
  const blockType = String(node.attrs.blockType ?? "");
  const fields = (node.attrs.fields ?? {}) as Record<string, unknown>;
  const fieldsMeta: Record<string, SubFieldMeta> = options.types[blockType] ?? {};
  const [expanded, setExpanded] = useState(() => Object.keys(fields).every((k) => !fields[k]));
  // Stable per-node id so sub-field DOM ids/names stay unique across repeated blocks of
  // the same type (two FAQ blocks must not share input ids/labels).
  const fieldIdPrefix = useId();

  const updateField = (fieldName: string, value: unknown) => {
    updateAttributes({ fields: { ...fields, [fieldName]: value } });
  };

  const getRelationOptions = (fieldName: string): RelationOption[] =>
    options.blockRelationOptions[`block:${options.fieldName}:${blockType}:${fieldName}`] ?? [];

  const preview = (() => {
    for (const [key, meta] of Object.entries(fieldsMeta)) {
      if (meta.type === "text" && fields[key]) {
        const text = String(fields[key]);
        return text.length > 60 ? text.slice(0, 60) + "..." : text;
      }
    }
    return "";
  })();

  return (
    <NodeViewWrapper
      className={cn(
        "bg-muted/20 my-3 overflow-hidden rounded-lg border",
        selected && "ring-ring/50 border-ring ring-2",
      )}
    >
      <div className="bg-muted/40 flex items-center gap-2 px-3 py-2 select-none" contentEditable={false}>
        <span
          data-drag-handle
          draggable="true"
          className="text-muted-foreground/50 hover:text-muted-foreground -ml-1 cursor-grab rounded p-1 transition-colors active:cursor-grabbing"
          title="Drag to reorder"
        >
          <GripVertical className="size-4" />
        </span>

        <button type="button" onClick={() => setExpanded((v) => !v)} className="group/row flex items-center gap-2">
          <ChevronRight
            className={cn(
              "text-muted-foreground group-hover/row:text-foreground/70 size-4 shrink-0 transition-[color,transform]",
              expanded && "rotate-90",
            )}
          />
          <span className="bg-secondary text-secondary-foreground rounded px-2 py-0.5 text-xs font-medium">
            {humanize(blockType)}
          </span>
        </button>

        {!expanded && preview && <span className="text-muted-foreground min-w-0 truncate text-sm">{preview}</span>}

        <Button
          type="button"
          variant="ghost"
          size="icon"
          title="Remove block"
          className="text-muted-foreground hover:text-destructive ml-auto size-7"
          onClick={() => deleteNode()}
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>

      {expanded && (
        <div className="space-y-4 border-t px-4 py-4" contentEditable={false}>
          {Object.keys(fieldsMeta).length === 0 && (
            <p className="text-muted-foreground text-sm">Unknown block type "{blockType}".</p>
          )}
          {Object.entries(fieldsMeta).map(([fieldName, meta]) => (
            <SubField
              key={fieldName}
              blockKey={fieldIdPrefix}
              fieldName={fieldName}
              meta={meta}
              value={fields[fieldName]}
              onChange={(v) => updateField(fieldName, v)}
              relationOptions={meta.type === "relation" ? getRelationOptions(fieldName) : []}
            />
          ))}
        </div>
      )}
    </NodeViewWrapper>
  );
}

const BlockNode = Node.create<BlockNodeOptions>({
  ...blockNodeSpec,
  addNodeView() {
    return ReactNodeViewRenderer(BlockNodeView);
  },
});

// -----------------------------------------------
// Toolbar button
// -----------------------------------------------

const ToolbarButton = ({
  onClick,
  active,
  disabled,
  children,
  title,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
  title: string;
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    title={title}
    className={cn(
      "disabled:hover:text-muted-foreground inline-flex size-8 items-center justify-center rounded-md transition-colors outline-none focus-visible:border-(color:--field-focus-border) focus-visible:ring-1 focus-visible:ring-(color:--field-focus-ring) disabled:opacity-50 disabled:hover:bg-transparent",
      active ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
    )}
  >
    {children}
  </button>
);

// -----------------------------------------------
// Editor component
// -----------------------------------------------

type Props = {
  name: string;
  initialValue?: string;
  rows?: number;
  types: BlockTypesMeta;
  blockRelationOptions?: Record<string, RelationOption[]>;
};

export default function ContentEditor({ name, initialValue, rows = 14, types, blockRelationOptions = {} }: Props) {
  const hiddenRef = useRef<HTMLInputElement>(null);
  const previewChannelRef = useRef<BroadcastChannel | null>(null);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkType, setLinkType] = useState<"internal" | "external">("internal");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkGroups, setLinkGroups] = useState<LinkGroup[]>([]);

  const [cmsJson, setCmsJson] = useState<string>(() => {
    if (!initialValue) return JSON.stringify({ type: "root", children: [] });
    try {
      const parsed = JSON.parse(initialValue);
      if (parsed?.type === "root") return initialValue;
    } catch {}
    return JSON.stringify({ type: "root", children: [] });
  });

  // Counter to force re-renders on selection/transaction changes
  const [, setTick] = useState(0);
  const forceTick = useCallback(() => setTick((t) => t + 1), []);

  const parsedInitial = (() => {
    try {
      return JSON.parse(cmsJson);
    } catch {
      return { type: "root", children: [] };
    }
  })();

  // Notify the form of value changes so UnsavedGuard detects them
  const prevCmsJsonRef = useRef(cmsJson);
  useEffect(() => {
    if (prevCmsJsonRef.current !== cmsJson) {
      prevCmsJsonRef.current = cmsJson;
      hiddenRef.current?.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }, [cmsJson]);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Image,
      Link.configure({
        openOnClick: false,
        autolink: false,
        linkOnPaste: false,
        HTMLAttributes: { class: "text-primary underline cursor-text pointer-events-none" },
      }),
      // Command hint, shown on the empty field and on the empty paragraph the cursor is on.
      Placeholder.configure({
        showOnlyCurrent: true,
        placeholder: ({ node }) => (node.type.name === "paragraph" ? "Type / for commands…" : ""),
      }),
      BlockNode.configure({ types, blockRelationOptions, fieldName: name }),
      SlashCommand.configure({ types }),
    ],
    content: contentToTiptap(parsedInitial),
    onUpdate: ({ editor }) => {
      const cmsDoc = tiptapToContent(editor.getJSON());
      const json = JSON.stringify(cmsDoc);
      setCmsJson(json);
      // Live preview: broadcast for server-side rendering
      if (!previewChannelRef.current) previewChannelRef.current = new BroadcastChannel("cms-preview");
      previewChannelRef.current.postMessage({ field: name, value: json, render: "content" });
    },
    onSelectionUpdate: forceTick,
    onTransaction: forceTick,
    editorProps: {
      attributes: {
        class: "prose prose-sm max-w-none text-base focus:outline-none py-3 px-5",
        style: `min-height: ${rows * 1.5}rem;`,
      },
      handleDOMEvents: {
        mousedown(_view, event) {
          const target = event.target as HTMLElement;
          if (target.tagName === "A" || target.closest("a")) {
            event.preventDefault();
          }
        },
        click(_view, event) {
          const target = event.target as HTMLElement;
          if (target.tagName === "A" || target.closest("a")) {
            event.preventDefault();
            event.stopPropagation();
            return true;
          }
        },
      },
    },
  });

  // Listen for external content updates (e.g. AI translate)
  useEffect(() => {
    const hidden = hiddenRef.current;
    if (!hidden) return;
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (typeof detail !== "string") return;
      try {
        const parsed = JSON.parse(detail);
        if (parsed?.type === "root") {
          setCmsJson(detail);
          editor?.commands.setContent(contentToTiptap(parsed));
        }
      } catch {}
    };
    hidden.addEventListener("cms:set-value", handler);
    return () => hidden.removeEventListener("cms:set-value", handler);
  });

  const openLinkDialog = () => {
    if (!editor) return;
    const href = editor.getAttributes("link").href ?? "";
    setLinkUrl(href);
    const isExternal = href.startsWith("http://") || href.startsWith("https://");
    setLinkType(href && !isExternal ? "internal" : href ? "external" : "internal");
    if (linkGroups.length === 0) fetchLinkGroups().then(setLinkGroups);
    setLinkDialogOpen(true);
  };

  const minHeight = `${rows * 1.5}rem`;

  return (
    <div className="border-input hover:border-foreground/20 focus-within:hover:border-ring bg-muted/30 dark:bg-input/30 overflow-hidden rounded-lg border transition-colors focus-within:border-(color:--field-focus-border) focus-within:ring-1 focus-within:ring-(color:--field-focus-ring)">
      <input ref={hiddenRef} type="hidden" name={name} value={cmsJson} />

      {/* Editor area */}
      {editor ? (
        <>
          {/* Selection toolbar — appears when text is highlighted */}
          <BubbleMenu
            editor={editor}
            options={{ placement: "top" }}
            shouldShow={({ editor: ed, from, to }) => from !== to && !ed.isActive(BLOCK_NODE_NAME)}
            className="bg-popover flex items-center gap-0.5 rounded-md border p-1 shadow-md"
          >
            <ToolbarButton
              onClick={() => editor.chain().focus().toggleBold().run()}
              active={editor.isActive("bold")}
              title="Bold"
            >
              <Bold className="size-4" />
            </ToolbarButton>
            <ToolbarButton
              onClick={() => editor.chain().focus().toggleItalic().run()}
              active={editor.isActive("italic")}
              title="Italic"
            >
              <Italic className="size-4" />
            </ToolbarButton>
            <div className="bg-border mx-0.5 h-5 w-px" />
            <ToolbarButton
              onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
              active={editor.isActive("heading", { level: 2 })}
              title="Heading 2"
            >
              <Heading2 className="size-4" />
            </ToolbarButton>
            <ToolbarButton
              onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
              active={editor.isActive("heading", { level: 3 })}
              title="Heading 3"
            >
              <Heading3 className="size-4" />
            </ToolbarButton>
            <div className="bg-border mx-0.5 h-5 w-px" />
            <ToolbarButton onClick={openLinkDialog} active={editor.isActive("link")} title="Link">
              <LinkIcon className="size-4" />
            </ToolbarButton>
          </BubbleMenu>
          <EditorContent editor={editor} />
        </>
      ) : (
        <div className="prose prose-sm max-w-none" style={{ minHeight, padding: "0.625rem 0.75rem" }} />
      )}

      <LinkDialog
        open={linkDialogOpen}
        onOpenChange={setLinkDialogOpen}
        linkType={linkType}
        onLinkTypeChange={setLinkType}
        linkUrl={linkUrl}
        onLinkUrlChange={setLinkUrl}
        linkGroups={linkGroups}
        isEditing={!!editor?.isActive("link")}
        onApply={() => {
          if (linkUrl) {
            const isExternal = linkUrl.startsWith("http://") || linkUrl.startsWith("https://");
            editor
              ?.chain()
              .focus()
              .setLink({ href: linkUrl, target: isExternal ? "_blank" : null })
              .run();
          }
          setLinkDialogOpen(false);
        }}
        onRemove={() => {
          editor?.chain().focus().unsetLink().run();
          setLinkDialogOpen(false);
        }}
      />
    </div>
  );
}
