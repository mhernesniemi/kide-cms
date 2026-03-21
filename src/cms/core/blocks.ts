import { cmsImage, cmsSrcset } from "./image";
import { renderRichText } from "./richtext";

function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function parseJson(val: unknown): any {
  if (typeof val === "string") {
    try {
      return JSON.parse(val);
    } catch {
      return val;
    }
  }
  return val;
}

function isRichText(val: unknown): boolean {
  const parsed = parseJson(val);
  return parsed && typeof parsed === "object" && parsed.type === "root";
}

function isImageUrl(val: unknown): boolean {
  const s = String(val ?? "");
  return s.startsWith("/uploads/") || s.startsWith("http://") || s.startsWith("https://");
}

function isImageArray(val: unknown): boolean {
  const parsed = parseJson(val);
  return Array.isArray(parsed) && parsed.length > 0 && parsed.every((v: unknown) => isImageUrl(v));
}

function isRepeaterArray(val: unknown): boolean {
  const parsed = parseJson(val);
  return Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === "object" && parsed[0] !== null;
}

function renderImage(src: string): string {
  const isLocal = src.startsWith("/uploads/");
  if (isLocal) {
    return `<img src="${esc(cmsImage(src, 1024))}" srcset="${esc(cmsSrcset(src))}" sizes="(max-width: 768px) 100vw, 768px" alt="" loading="lazy" class="h-auto w-full rounded-lg object-cover" />`;
  }
  return `<img src="${esc(src)}" alt="" loading="lazy" class="w-full rounded-lg object-cover" />`;
}

function renderFieldValue(key: string, val: unknown): string {
  if (val === null || val === undefined || val === "") return "";

  const parsed = parseJson(val);

  // Rich text
  if (isRichText(val)) {
    return `<div class="prose">${renderRichText(parsed)}</div>`;
  }

  // Image array
  if (isImageArray(val)) {
    const images = Array.isArray(parsed) ? parsed : [];
    return `<div class="grid gap-4">${images.map((src: unknown) => renderImage(String(src))).join("")}</div>`;
  }

  // Single image URL
  if (isImageUrl(val)) {
    return renderImage(String(val));
  }

  // Repeater array (objects with title/description-like fields)
  if (isRepeaterArray(val)) {
    const items = Array.isArray(parsed) ? parsed : [];
    let html = `<div class="grid gap-3">`;
    for (const item of items) {
      html += `<div class="rounded-lg border border-gray-200 bg-gray-50 px-5 py-4">`;
      for (const [k, v] of Object.entries(item)) {
        if (k === "_key" || k === "id" || !v) continue;
        html += `<p class="${k.includes("description") || k.includes("answer") || k.includes("body") ? "m-0 text-gray-500" : "mb-1 font-semibold"}">${esc(v)}</p>`;
      }
      html += `</div>`;
    }
    html += `</div>`;
    return html;
  }

  // Heading-like field names
  if (key === "heading" || key === "title") {
    return `<h2 class="mb-3 text-xl font-semibold">${esc(val)}</h2>`;
  }

  // Eyebrow/label
  if (key === "eyebrow" || key === "label") {
    return `<p class="mb-1 text-xs font-semibold uppercase tracking-wide text-teal-700">${esc(val)}</p>`;
  }

  // CTA link
  if (key === "ctaLabel" || key === "ctaHref") {
    return ""; // handled together below
  }

  // Default: paragraph
  return `<p class="text-gray-500">${esc(val)}</p>`;
}

export function renderBlock(block: Record<string, any>): string {
  const { type: _type, _key, ...fields } = block;

  let html = `<section class="py-8">`;

  // Render eyebrow first if present
  if (fields.eyebrow) {
    html += renderFieldValue("eyebrow", fields.eyebrow);
  }

  // Render heading/title next
  for (const key of ["heading", "title"]) {
    if (fields[key]) {
      html += renderFieldValue(key, fields[key]);
    }
  }

  // Render remaining fields
  for (const [key, val] of Object.entries(fields)) {
    if (["eyebrow", "heading", "title", "ctaLabel", "ctaHref"].includes(key)) continue;
    html += renderFieldValue(key, val);
  }

  // CTA button
  if (fields.ctaLabel && fields.ctaHref) {
    html += `<a href="${esc(fields.ctaHref)}" class="mt-4 inline-block rounded-md bg-teal-700 px-4 py-2 text-sm text-white no-underline">${esc(fields.ctaLabel)}</a>`;
  }

  html += `</section>`;
  return html;
}

export function renderBlocks(blocks: Array<Record<string, any>>): string {
  return blocks.map(renderBlock).join("");
}
