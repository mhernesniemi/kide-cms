import type { FieldConfig, RichTextDocument, RichTextNode } from "./define";

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

const renderNode = (node: RichTextNode): string => {
  if (node.type === "text") {
    let content = escapeHtml(String(node.value ?? ""));
    if (node.bold) content = `<strong>${content}</strong>`;
    if (node.italic) content = `<em>${content}</em>`;
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
    const src = escapeHtml(String(node.src ?? ""));
    const alt = escapeHtml(String(node.alt ?? ""));
    return `<img src="${src}" alt="${alt}" style="max-width: 100%; border-radius: 0.5rem;" />`;
  }

  return "";
};

export const renderRichText = (document?: RichTextDocument | null) => {
  if (!document || document.type !== "root") {
    return "";
  }

  return document.children.map(renderNode).join("");
};

export const richTextToPlainText = (document?: RichTextDocument | null): string => {
  if (!document?.children) {
    return "";
  }

  const flatten = (node: RichTextNode): string => {
    if (node.type === "text") {
      return String(node.value ?? "");
    }

    return (node.children ?? []).map(flatten).join("");
  };

  return document.children.map(flatten).join("\n\n").trim();
};

export const serializeFieldValue = (field: FieldConfig, value: unknown): string => {
  if (value === null || value === undefined) {
    return "";
  }

  if (field.type === "richText") {
    return richTextToPlainText(value as RichTextDocument);
  }

  if (field.type === "array") {
    return Array.isArray(value) ? value.map((item) => String(item ?? "")).join("\n") : "";
  }

  if (field.type === "json" || field.type === "blocks") {
    return JSON.stringify(value, null, 2);
  }

  if (field.type === "boolean") {
    return value ? "true" : "false";
  }

  return String(value);
};
