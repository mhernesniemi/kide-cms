import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useState, useEffect, useCallback } from "react";
import {
  Bold,
  Italic,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Undo,
  Redo,
} from "lucide-react";

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
    const wrapped = content.map((c: any) =>
      c.type === "paragraph" ? c : { type: "paragraph", content: [c] },
    );
    return { type: "listItem", ...(wrapped.length > 0 ? { content: wrapped } : {}) };
  }
  if (node.type === "quote") {
    const content = (node.children ?? []).map(cmsNodeToTiptap).filter(Boolean);
    return { type: "blockquote", ...(content.length > 0 ? { content } : {}) };
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
    className={`inline-flex size-8 items-center justify-center rounded-md transition-colors ${
      active
        ? "bg-accent text-accent-foreground"
        : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
    } disabled:opacity-50`}
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
};

export default function RichTextEditor({ name, initialValue, rows = 10 }: Props) {
  const [cmsJson, setCmsJson] = useState<string>(() => {
    if (!initialValue) return JSON.stringify({ type: "root", children: [] });
    // initialValue might be serialized JSON string or already a string
    try {
      const parsed = JSON.parse(initialValue);
      if (parsed?.type === "root") return initialValue;
    } catch {}
    return JSON.stringify({ type: "root", children: [] });
  });

  const parsedInitial = (() => {
    try {
      return JSON.parse(cmsJson);
    } catch {
      return { type: "root", children: [] };
    }
  })();

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [StarterKit],
    content: cmsToTiptap(parsedInitial),
    onUpdate: ({ editor }) => {
      const tiptapJson = editor.getJSON();
      const cmsDoc = tiptapToCms(tiptapJson);
      setCmsJson(JSON.stringify(cmsDoc));
    },
    editorProps: {
      attributes: {
        class: "prose prose-sm max-w-none focus:outline-none",
        style: `min-height: ${rows * 1.5}rem; padding: 0.75rem`,
      },
    },
  });

  if (!editor) return null;

  return (
    <div className="overflow-hidden rounded-md border focus-within:ring-[3px] focus-within:ring-ring/50 focus-within:border-ring">
      <input type="hidden" name={name} value={cmsJson} />

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 border-b bg-muted/30 px-2 py-1.5">
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

        <div className="mx-1 h-5 w-px bg-border" />

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

        <div className="mx-1 h-5 w-px bg-border" />

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          active={editor.isActive("bulletList")}
          title="Bullet list"
        >
          <List className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          active={editor.isActive("orderedList")}
          title="Ordered list"
        >
          <ListOrdered className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          active={editor.isActive("blockquote")}
          title="Blockquote"
        >
          <Quote className="size-4" />
        </ToolbarButton>

        <div className="mx-1 h-5 w-px bg-border" />

        <ToolbarButton
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
          title="Undo"
        >
          <Undo className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          title="Redo"
        >
          <Redo className="size-4" />
        </ToolbarButton>
      </div>

      {/* Editor area */}
      <EditorContent editor={editor} />
    </div>
  );
}
