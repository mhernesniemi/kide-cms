import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bold,
  Check,
  ChevronsUpDown,
  Italic,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  ImageIcon,
  Link as LinkIcon,
  Undo,
  Redo,
} from "lucide-react";
import { Button } from "./ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "./ui/command";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { cn } from "../lib/utils";
import ImageBrowseDialog from "./ImageBrowseDialog";

// -----------------------------------------------
// CMS AST ↔ Tiptap JSON conversion
// -----------------------------------------------

type CmsNode = {
  type: string;
  value?: string;
  level?: number;
  ordered?: boolean;
  bold?: boolean;
  italic?: boolean;
  children?: CmsNode[];
  [key: string]: unknown;
};

type CmsDocument = {
  type: "root";
  children: CmsNode[];
};

const cmsNodeToTiptap = (node: CmsNode): any => {
  if (node.type === "text") {
    const marks: any[] = [];
    if (node.bold) marks.push({ type: "bold" });
    if (node.italic) marks.push({ type: "italic" });
    if (node.href) marks.push({ type: "link", attrs: { href: node.href, target: node.target ?? null } });
    return { type: "text", text: node.value ?? "", ...(marks.length > 0 ? { marks } : {}) };
  }
  if (node.type === "paragraph") {
    const content = (node.children ?? []).map(cmsNodeToTiptap).filter(Boolean);
    return { type: "paragraph", ...(content.length > 0 ? { content } : {}) };
  }
  if (node.type === "heading") {
    const content = (node.children ?? []).map(cmsNodeToTiptap).filter(Boolean);
    return {
      type: "heading",
      attrs: { level: node.level ?? 2 },
      ...(content.length > 0 ? { content } : {}),
    };
  }
  if (node.type === "list") {
    const content = (node.children ?? []).map(cmsNodeToTiptap).filter(Boolean);
    return {
      type: node.ordered ? "orderedList" : "bulletList",
      ...(content.length > 0 ? { content } : {}),
    };
  }
  if (node.type === "list-item") {
    const content = (node.children ?? []).map(cmsNodeToTiptap).filter(Boolean);
    // Tiptap expects list items to contain paragraphs
    const wrapped = content.map((c: any) => (c.type === "paragraph" ? c : { type: "paragraph", content: [c] }));
    return { type: "listItem", ...(wrapped.length > 0 ? { content: wrapped } : {}) };
  }
  if (node.type === "quote") {
    const content = (node.children ?? []).map(cmsNodeToTiptap).filter(Boolean);
    return { type: "blockquote", ...(content.length > 0 ? { content } : {}) };
  }
  if (node.type === "image") {
    return { type: "image", attrs: { src: node.src ?? "", alt: node.alt ?? "", title: node.title ?? "" } };
  }
  return null;
};

const cmsToTiptap = (doc: CmsDocument | null | undefined): any => {
  if (!doc || doc.type !== "root") {
    return { type: "doc", content: [{ type: "paragraph" }] };
  }
  const content = doc.children.map(cmsNodeToTiptap).filter(Boolean);
  return { type: "doc", content: content.length > 0 ? content : [{ type: "paragraph" }] };
};

const tiptapNodeToCms = (node: any): CmsNode | null => {
  if (node.type === "text") {
    const result: CmsNode = { type: "text", value: node.text ?? "" };
    if (node.marks) {
      for (const mark of node.marks) {
        if (mark.type === "bold") result.bold = true;
        if (mark.type === "italic") result.italic = true;
        if (mark.type === "link") {
          result.href = mark.attrs?.href ?? "";
          if (mark.attrs?.target) result.target = mark.attrs.target;
        }
      }
    }
    return result;
  }
  if (node.type === "paragraph") {
    return {
      type: "paragraph",
      children: (node.content ?? []).map(tiptapNodeToCms).filter(Boolean),
    };
  }
  if (node.type === "heading") {
    return {
      type: "heading",
      level: node.attrs?.level ?? 2,
      children: (node.content ?? []).map(tiptapNodeToCms).filter(Boolean),
    };
  }
  if (node.type === "bulletList" || node.type === "orderedList") {
    return {
      type: "list",
      ordered: node.type === "orderedList",
      children: (node.content ?? []).map(tiptapNodeToCms).filter(Boolean),
    };
  }
  if (node.type === "listItem") {
    return {
      type: "list-item",
      children: (node.content ?? []).map(tiptapNodeToCms).filter(Boolean),
    };
  }
  if (node.type === "blockquote") {
    return {
      type: "quote",
      children: (node.content ?? []).map(tiptapNodeToCms).filter(Boolean),
    };
  }
  if (node.type === "image") {
    return { type: "image", src: node.attrs?.src ?? "", alt: node.attrs?.alt ?? "", title: node.attrs?.title ?? "" };
  }
  return null;
};

const tiptapToCms = (json: any): CmsDocument => ({
  type: "root",
  children: (json.content ?? []).map(tiptapNodeToCms).filter(Boolean),
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
      "focus-visible:ring-ring/50 focus-visible:border-ring inline-flex size-8 items-center justify-center rounded-md transition-colors outline-none focus-visible:ring-2 disabled:opacity-50",
      active ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
    )}
  >
    {children}
  </button>
);

// -----------------------------------------------
// Link dialog
// -----------------------------------------------

function LinkDialog({
  open,
  onOpenChange,
  linkType,
  onLinkTypeChange,
  linkUrl,
  onLinkUrlChange,
  linkGroups,
  isEditing,
  onApply,
  onRemove,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  linkType: "internal" | "external";
  onLinkTypeChange: (type: "internal" | "external") => void;
  linkUrl: string;
  onLinkUrlChange: (url: string) => void;
  linkGroups: Array<{ label: string; items: Array<{ label: string; href: string }> }>;
  isEditing: boolean;
  onApply: () => void;
  onRemove: () => void;
}) {
  const [comboOpen, setComboOpen] = useState(false);
  const selectedLabel = (() => {
    for (const group of linkGroups) {
      const found = group.items.find((item) => item.href === linkUrl);
      if (found) return found.label;
    }
    return "";
  })();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit link" : "Insert link"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="link-type"
                checked={linkType === "internal"}
                onChange={() => {
                  onLinkTypeChange("internal");
                  onLinkUrlChange("");
                }}
                className="size-4"
              />
              Internal
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="link-type"
                checked={linkType === "external"}
                onChange={() => {
                  onLinkTypeChange("external");
                  onLinkUrlChange("");
                }}
                className="size-4"
              />
              External
            </label>
          </div>

          {linkType === "external" ? (
            <div className="grid gap-2">
              <Label htmlFor="link-url">URL</Label>
              <Input
                id="link-url"
                value={linkUrl}
                onChange={(e) => onLinkUrlChange(e.target.value)}
                placeholder="https://example.com"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    onApply();
                  }
                }}
              />
            </div>
          ) : (
            <div className="grid gap-2">
              <Label>Page</Label>
              <Popover open={comboOpen} onOpenChange={setComboOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={comboOpen}
                    size="lg"
                    className="border-input bg-muted/30 hover:bg-muted dark:bg-input/30 dark:hover:bg-input/50 w-full justify-between text-base font-normal"
                  >
                    <span className={cn("truncate", !selectedLabel && "text-muted-foreground")}>
                      {selectedLabel || "Search documents..."}
                    </span>
                    <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search documents..." />
                    <CommandList>
                      <CommandEmpty>No documents found.</CommandEmpty>
                      {linkGroups.map((group) => (
                        <CommandGroup key={group.label} heading={group.label}>
                          {group.items.map((item) => (
                            <CommandItem
                              key={item.href}
                              value={`${item.label} ${item.href}`}
                              onSelect={() => {
                                onLinkUrlChange(item.href === linkUrl ? "" : item.href);
                                setComboOpen(false);
                              }}
                            >
                              <Check
                                className={cn("ml-1 size-4", linkUrl === item.href ? "opacity-100" : "opacity-0")}
                              />
                              {item.label}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      ))}
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          )}
        </div>
        <DialogFooter>
          {isEditing && (
            <Button variant="ghost" className="mr-auto" onClick={onRemove}>
              Remove link
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onApply} disabled={!linkUrl}>
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// -----------------------------------------------
// Editor component
// -----------------------------------------------

type Props = {
  name: string;
  initialValue?: string;
  rows?: number;
  onChange?: (value: string) => void;
};

export default function RichTextEditor({ name, initialValue, rows = 10, onChange }: Props) {
  const hiddenRef = useRef<HTMLInputElement>(null);
  const previewChannelRef = useRef<BroadcastChannel | null>(null);
  const [imageBrowseOpen, setImageBrowseOpen] = useState(false);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkType, setLinkType] = useState<"internal" | "external">("internal");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkGroups, setLinkGroups] = useState<Array<{ label: string; items: Array<{ label: string; href: string }> }>>(
    [],
  );

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
    ],
    content: cmsToTiptap(parsedInitial),
    onUpdate: ({ editor }) => {
      const tiptapJson = editor.getJSON();
      const cmsDoc = tiptapToCms(tiptapJson);
      const json = JSON.stringify(cmsDoc);
      setCmsJson(json);
      onChange?.(json);
      // Live preview: broadcast for server-side rendering
      if (!previewChannelRef.current) previewChannelRef.current = new BroadcastChannel("cms-preview");
      previewChannelRef.current.postMessage({ field: name, value: json, render: "richText" });
    },
    onSelectionUpdate: forceTick,
    onTransaction: forceTick,
    editorProps: {
      attributes: {
        class: "prose prose-sm max-w-none text-base focus:outline-none",
        style: `min-height: ${rows * 1.5}rem; padding: 0.625rem 0.75rem`,
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
          if (editor) {
            editor.commands.setContent(cmsToTiptap(parsed));
          }
        }
      } catch {}
    };
    hidden.addEventListener("cms:set-value", handler);
    return () => hidden.removeEventListener("cms:set-value", handler);
  });

  const minHeight = `${rows * 1.5}rem`;

  return (
    <div className="border-input hover:border-foreground/20 focus-within:border-ring focus-within:ring-ring/50 overflow-hidden rounded-lg border transition-colors focus-within:ring-3">
      <input ref={hiddenRef} type="hidden" name={name} value={cmsJson} />

      {/* Toolbar */}
      <div className="bg-muted/40 dark:bg-input/30 flex flex-wrap items-center gap-0.5 border-b px-2 py-1.5">
        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleBold().run()}
          active={editor?.isActive("bold")}
          disabled={!editor}
          title="Bold"
        >
          <Bold className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleItalic().run()}
          active={editor?.isActive("italic")}
          disabled={!editor}
          title="Italic"
        >
          <Italic className="size-4" />
        </ToolbarButton>

        <div className="bg-border mx-1 h-5 w-px" />

        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
          active={editor?.isActive("heading", { level: 2 })}
          disabled={!editor}
          title="Heading 2"
        >
          <Heading2 className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
          active={editor?.isActive("heading", { level: 3 })}
          disabled={!editor}
          title="Heading 3"
        >
          <Heading3 className="size-4" />
        </ToolbarButton>

        <div className="bg-border mx-1 h-5 w-px" />

        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
          active={editor?.isActive("bulletList")}
          disabled={!editor}
          title="Bullet list"
        >
          <List className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
          active={editor?.isActive("orderedList")}
          disabled={!editor}
          title="Ordered list"
        >
          <ListOrdered className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleBlockquote().run()}
          active={editor?.isActive("blockquote")}
          disabled={!editor}
          title="Blockquote"
        >
          <Quote className="size-4" />
        </ToolbarButton>

        <ToolbarButton
          onClick={() => {
            const href = editor?.getAttributes("link").href ?? "";
            setLinkUrl(href);
            const isExternal = href.startsWith("http://") || href.startsWith("https://");
            setLinkType(href && !isExternal ? "internal" : href ? "external" : "internal");
            // Fetch internal pages for the picker
            if (linkGroups.length === 0) {
              Promise.all([
                fetch("/api/cms/pages?status=published&limit=200").then((r) => (r.ok ? r.json() : { docs: [] })),
                fetch("/api/cms/posts?status=published&limit=200").then((r) => (r.ok ? r.json() : { docs: [] })),
              ]).then(([pagesRes, postsRes]) => {
                const groups: typeof linkGroups = [];
                if (pagesRes.docs?.length) {
                  groups.push({
                    label: "Pages",
                    items: pagesRes.docs.map((p: Record<string, unknown>) => ({
                      label: String(p.title ?? p.slug),
                      href: `/${p.slug}`,
                    })),
                  });
                }
                if (postsRes.docs?.length) {
                  groups.push({
                    label: "Posts",
                    items: postsRes.docs.map((p: Record<string, unknown>) => ({
                      label: String(p.title ?? p.slug),
                      href: `/blog/${p.slug}`,
                    })),
                  });
                }
                setLinkGroups(groups);
              });
            }
            setLinkDialogOpen(true);
          }}
          active={editor?.isActive("link")}
          disabled={!editor}
          title="Link"
        >
          <LinkIcon className="size-4" />
        </ToolbarButton>

        <div className="bg-border mx-1 h-5 w-px" />

        <ToolbarButton onClick={() => setImageBrowseOpen(true)} disabled={!editor} title="Insert image">
          <ImageIcon className="size-4" />
        </ToolbarButton>
        <div className="bg-border mx-1 h-5 w-px" />

        <ToolbarButton
          onClick={() => editor?.chain().focus().undo().run()}
          disabled={!editor?.can().undo()}
          title="Undo"
        >
          <Undo className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor?.chain().focus().redo().run()}
          disabled={!editor?.can().redo()}
          title="Redo"
        >
          <Redo className="size-4" />
        </ToolbarButton>
      </div>

      {/* Editor area — placeholder shown until Tiptap mounts */}
      {editor ? (
        <EditorContent editor={editor} />
      ) : (
        <div className="prose prose-sm max-w-none" style={{ minHeight, padding: "0.625rem 0.75rem" }} />
      )}

      <ImageBrowseDialog
        open={imageBrowseOpen}
        onOpenChange={setImageBrowseOpen}
        onSelect={(asset) => {
          editor?.chain().focus().setImage({ src: asset.url, alt: asset.filename }).run();
        }}
      />

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
