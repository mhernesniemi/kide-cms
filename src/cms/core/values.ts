import type { FieldConfig, RichTextDocument, RichTextNode } from "./define";
import { cmsImage, cmsSrcset } from "./image";

export const cloneValue = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export const slugify = (value: string) =>
  value
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");

export const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

export const createRichTextFromPlainText = (text: string): RichTextDocument => ({
  type: "root",
  children: text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => ({
      type: "paragraph",
      children: paragraph
        .split("\n")
        .map((line, index, lines) => `${line}${index < lines.length - 1 ? "\n" : ""}`)
        .filter(Boolean)
        .map((line) => ({ type: "text", value: line })),
    })),
});

// --- HTML → rich-text AST --------------------------------------------------
// A small, dependency-free converter so migrations/imports from any HTML source
// are a one-liner. Maps to the same node shapes renderNode emits below
// (paragraph | heading | list/list-item | quote | image; inline text carries
// bold/italic/href). Unknown/unsupported tags are unwrapped, not errored on.

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", copy: "©", reg: "®",
  trade: "™", hellip: "…", mdash: "—", ndash: "–", lsquo: "‘", rsquo: "’",
  ldquo: "“", rdquo: "”", deg: "°", times: "×", middot: "·",
};

const decodeEntities = (text: string): string =>
  text.replace(/&(#x?[0-9a-f]+|[a-z][a-z0-9]*);/gi, (whole, code: string) => {
    if (code[0] === "#") {
      const n = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : whole;
    }
    return NAMED_ENTITIES[code] ?? NAMED_ENTITIES[code.toLowerCase()] ?? whole;
  });

type HtmlEl = { tag: string; attrs: Record<string, string>; children: HtmlChild[] };
type HtmlChild = HtmlEl | { text: string };
const isText = (n: HtmlChild): n is { text: string } => "text" in n;

const VOID_TAGS = new Set(["br", "hr", "img", "input", "source", "meta", "link", "col", "area", "base", "embed", "wbr"]);
const BLOCK_OR_CONTAINER = new Set([
  "p", "pre", "ul", "ol", "li", "blockquote", "div", "section", "article", "main", "header",
  "footer", "aside", "figure", "figcaption", "table", "img", "h1", "h2", "h3", "h4", "h5", "h6",
]);

const parseAttrs = (raw: string): Record<string, string> => {
  const attrs: Record<string, string> = {};
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    attrs[m[1].toLowerCase()] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? "");
  }
  return attrs;
};

const buildHtmlTree = (html: string): HtmlEl => {
  const root: HtmlEl = { tag: "#root", attrs: {}, children: [] };
  const stack: HtmlEl[] = [root];
  const re = /<!--[\s\S]*?-->|<\/([a-zA-Z][a-zA-Z0-9-]*)\s*>|<([a-zA-Z][a-zA-Z0-9-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)\/?>/g;
  let last = 0;
  let m: RegExpExecArray | null;
  const pushText = (text: string) => {
    if (text) stack[stack.length - 1].children.push({ text });
  };
  while ((m = re.exec(html))) {
    pushText(html.slice(last, m.index));
    last = m.index + m[0].length;
    if (m[0].startsWith("<!--")) continue;
    if (m[1]) {
      const tag = m[1].toLowerCase();
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i].tag === tag) {
          stack.length = i;
          break;
        }
      }
    } else if (m[2]) {
      const tag = m[2].toLowerCase();
      const el: HtmlEl = { tag, attrs: parseAttrs(m[3] ?? ""), children: [] };
      stack[stack.length - 1].children.push(el);
      if (!(m[0].endsWith("/>") || VOID_TAGS.has(tag))) stack.push(el);
    }
  }
  pushText(html.slice(last));
  return root;
};

type Marks = { bold?: boolean; italic?: boolean; href?: string };

const collectInline = (children: HtmlChild[], marks: Marks = {}, out: RichTextNode[] = []): RichTextNode[] => {
  for (const child of children) {
    if (isText(child)) {
      const value = decodeEntities(child.text).replace(/\s+/g, " ");
      if (value) out.push({ type: "text", value, ...marks });
      continue;
    }
    const { tag } = child;
    if (tag === "br") {
      if (out.length) out[out.length - 1].value = `${out[out.length - 1].value ?? ""}\n`;
    } else if (tag === "strong" || tag === "b") {
      collectInline(child.children, { ...marks, bold: true }, out);
    } else if (tag === "em" || tag === "i") {
      collectInline(child.children, { ...marks, italic: true }, out);
    } else if (tag === "a") {
      collectInline(child.children, { ...marks, href: child.attrs.href || marks.href }, out);
    } else if (tag !== "img") {
      collectInline(child.children, marks, out); // span, code, mark, … — unwrap
    }
  }
  return out;
};

const inlineChildren = (children: HtmlChild[]): RichTextNode[] =>
  collectInline(children).filter((leaf) => ((leaf.value as string) ?? "").length > 0);

// True when leaves carry real content, not just whitespace between block tags.
const meaningful = (leaves: RichTextNode[]): boolean =>
  leaves.some((leaf) => String(leaf.value ?? "").trim().length > 0);

const walkBlocks = (el: HtmlEl, out: RichTextNode[]): void => {
  for (const child of el.children) {
    if (isText(child)) {
      const leaves = inlineChildren([child]);
      if (meaningful(leaves)) out.push({ type: "paragraph", children: leaves });
      continue;
    }
    const { tag } = child;
    if (tag === "p" || tag === "pre") {
      const leaves = inlineChildren(child.children);
      if (meaningful(leaves)) out.push({ type: "paragraph", children: leaves });
    } else if (/^h[1-6]$/.test(tag)) {
      const leaves = inlineChildren(child.children);
      if (meaningful(leaves)) out.push({ type: "heading", level: Number(tag[1]), children: leaves });
    } else if (tag === "ul" || tag === "ol") {
      const items = child.children
        .filter((c): c is HtmlEl => !isText(c) && c.tag === "li")
        .map((li) => ({ type: "list-item", children: inlineChildren(li.children) }))
        .filter((item) => meaningful(item.children));
      if (items.length) out.push({ type: "list", ordered: tag === "ol", children: items });
    } else if (tag === "blockquote") {
      const leaves = inlineChildren(child.children);
      if (meaningful(leaves)) out.push({ type: "quote", children: leaves });
    } else if (tag === "img") {
      if (child.attrs.src) out.push({ type: "image", src: child.attrs.src, alt: child.attrs.alt ?? "" });
    } else if (tag === "hr" || tag === "br") {
      // no structural equivalent — skip
    } else {
      // div/section/figure/table/… — descend for block descendants, else treat as a paragraph
      const hasBlockChild = child.children.some((c) => !isText(c) && BLOCK_OR_CONTAINER.has((c as HtmlEl).tag));
      if (hasBlockChild) {
        walkBlocks(child, out);
      } else {
        const leaves = inlineChildren(child.children);
        if (meaningful(leaves)) out.push({ type: "paragraph", children: leaves });
      }
    }
  }
};

/**
 * Convert an HTML string into the CMS rich-text AST. Forgiving by design — it
 * tolerates malformed markup, unwraps unsupported inline tags, and falls back to
 * plain text when no structure is found. Returns an empty document for empty
 * input. Pair with createRichTextFromPlainText for non-HTML sources.
 */
export const htmlToRichText = (html: string | null | undefined): RichTextDocument => {
  if (!html || !html.trim()) return { type: "root", children: [] };
  const children: RichTextNode[] = [];
  walkBlocks(buildHtmlTree(html), children);
  if (!children.length) return createRichTextFromPlainText(decodeEntities(html.replace(/<[^>]+>/g, " ")));
  return { type: "root", children };
};

const renderNode = (node: RichTextNode): string => {
  if (node.type === "text") {
    let content = escapeHtml(String(node.value ?? ""));
    if (node.bold) content = `<strong>${content}</strong>`;
    if (node.italic) content = `<em>${content}</em>`;
    if (node.href) {
      const href = escapeHtml(String(node.href));
      const isExternal = String(node.href).startsWith("http://") || String(node.href).startsWith("https://");
      const target = isExternal ? ' target="_blank" rel="noopener noreferrer"' : "";
      content = `<a href="${href}"${target}>${content}</a>`;
    }
    return content;
  }

  if (node.type === "paragraph") {
    return `<p>${(node.children ?? []).map(renderNode).join("")}</p>`;
  }

  if (node.type === "heading") {
    const level = Math.min(Math.max(Number(node.level ?? 2), 1), 6);
    return `<h${level}>${(node.children ?? []).map(renderNode).join("")}</h${level}>`;
  }

  if (node.type === "list") {
    const tag = node.ordered ? "ol" : "ul";
    return `<${tag}>${(node.children ?? []).map(renderNode).join("")}</${tag}>`;
  }

  if (node.type === "list-item") {
    return `<li>${(node.children ?? []).map(renderNode).join("")}</li>`;
  }

  if (node.type === "quote") {
    return `<blockquote>${(node.children ?? []).map(renderNode).join("")}</blockquote>`;
  }

  if (node.type === "image") {
    const src = String(node.src ?? "");
    const alt = escapeHtml(String(node.alt ?? ""));
    const isLocal = src.startsWith("/uploads/");
    if (isLocal) {
      const sizes = "(max-width: 768px) 100vw, 768px";
      const avif = escapeHtml(cmsSrcset(src, undefined, "avif"));
      const webp = escapeHtml(cmsSrcset(src, undefined, "webp"));
      const fallback = escapeHtml(cmsImage(src, 1024));
      return `<picture><source type="image/avif" srcset="${avif}" sizes="${sizes}" /><source type="image/webp" srcset="${webp}" sizes="${sizes}" /><img src="${fallback}" alt="${alt}" loading="lazy" class="h-auto max-w-full rounded-lg" /></picture>`;
    }
    return `<img src="${escapeHtml(src)}" alt="${alt}" loading="lazy" class="max-w-full rounded-lg" />`;
  }

  return "";
};

export const renderRichText = (document?: RichTextDocument | null) => {
  if (!document || document.type !== "root") return "";
  return document.children.map(renderNode).join("");
};

export const richTextToPlainText = (document?: RichTextDocument | null): string => {
  if (!document?.children) return "";

  const flatten = (node: RichTextNode): string => {
    if (node.type === "text") {
      return String(node.value ?? "");
    }
    return (node.children ?? []).map(flatten).join("");
  };

  return document.children.map(flatten).join("\n\n").trim();
};

export const serializeFieldValue = (field: FieldConfig, value: unknown): string => {
  if (value === null || value === undefined) return "";
  if (field.type === "richText") return richTextToPlainText(value as RichTextDocument);
  if (field.type === "array") return Array.isArray(value) ? value.map((item) => String(item ?? "")).join(", ") : "";
  if (field.type === "json" || field.type === "blocks") return JSON.stringify(value, null, 2);
  if (field.type === "boolean") return value ? "true" : "false";
  return String(value);
};
