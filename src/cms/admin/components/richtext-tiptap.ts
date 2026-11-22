import type { StarterKitOptions } from "@tiptap/starter-kit";

// Link is configured separately by each editor. The rest have no CMS AST equivalent and would vanish on save.
export const starterKitOptions: Partial<StarterKitOptions> = {
  link: false,
  strike: false,
  code: false,
  underline: false,
  codeBlock: false,
  horizontalRule: false,
};

export type CmsNode = {
  type: string;
  value?: string;
  level?: number;
  ordered?: boolean;
  bold?: boolean;
  italic?: boolean;
  children?: CmsNode[];
  [key: string]: unknown;
};

export type CmsDocument = {
  type: "root";
  children: CmsNode[];
};

export const cmsNodeToTiptap = (node: CmsNode): any => {
  if (node.type === "text") {
    const marks: any[] = [];
    if (node.bold) marks.push({ type: "bold" });
    if (node.italic) marks.push({ type: "italic" });
    if (node.href) marks.push({ type: "link", attrs: { href: node.href, target: node.target ?? null } });
    return { type: "text", text: node.value ?? "", ...(marks.length > 0 ? { marks } : {}) };
  }
  if (node.type === "paragraph") {
    const content = cmsChildrenToTiptap(node.children);
    return { type: "paragraph", ...(content.length > 0 ? { content } : {}) };
  }
  if (node.type === "heading") {
    const content = cmsChildrenToTiptap(node.children);
    return {
      type: "heading",
      attrs: { level: node.level ?? 2 },
      ...(content.length > 0 ? { content } : {}),
    };
  }
  if (node.type === "list") {
    const content = cmsChildrenToTiptap(node.children);
    return {
      type: node.ordered ? "orderedList" : "bulletList",
      ...(content.length > 0 ? { content } : {}),
    };
  }
  if (node.type === "list-item") {
    const content = cmsChildrenToTiptap(node.children);
    // Tiptap expects list items to contain paragraphs; consecutive inline nodes share one.
    const wrapped: any[] = [];
    let inline: any = null;
    for (const c of content) {
      if (c.type === "paragraph") {
        wrapped.push(c);
        inline = null;
      } else if (inline) {
        inline.content.push(c);
      } else {
        inline = { type: "paragraph", content: [c] };
        wrapped.push(inline);
      }
    }
    return { type: "listItem", ...(wrapped.length > 0 ? { content: wrapped } : {}) };
  }
  if (node.type === "quote") {
    const content = cmsChildrenToTiptap(node.children);
    return { type: "blockquote", ...(content.length > 0 ? { content } : {}) };
  }
  if (node.type === "image") {
    return { type: "image", attrs: { src: node.src ?? "", alt: node.alt ?? "", title: node.title ?? "" } };
  }
  return null;
};

// Line breaks are stored as "\n" inside text values; Tiptap needs hardBreak nodes.
const cmsChildrenToTiptap = (children: CmsNode[] = []): any[] =>
  children
    .flatMap((child) => {
      const value = String(child.value ?? "");
      if (child.type !== "text" || !value.includes("\n")) return [cmsNodeToTiptap(child)];
      return value
        .split("\n")
        .flatMap((line, i) => [
          ...(i > 0 ? [{ type: "hardBreak" }] : []),
          ...(line ? [cmsNodeToTiptap({ ...child, value: line })] : []),
        ]);
    })
    .filter(Boolean);

export const cmsToTiptap = (doc: CmsDocument | null | undefined): any => {
  if (!doc || doc.type !== "root") {
    return { type: "doc", content: [{ type: "paragraph" }] };
  }
  const content = doc.children.map(cmsNodeToTiptap).filter(Boolean);
  return { type: "doc", content: content.length > 0 ? content : [{ type: "paragraph" }] };
};

export const tiptapNodeToCms = (node: any): CmsNode | null => {
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
  if (node.type === "hardBreak") return { type: "text", value: "\n" };
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

export const tiptapToCms = (json: any): CmsDocument => ({
  type: "root",
  children: (json.content ?? []).map(tiptapNodeToCms).filter(Boolean),
});
