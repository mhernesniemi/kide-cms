import { cmsImage, cmsSrcset, renderRichText } from "@kide/core";

function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function parseJson(value: unknown): any {
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
}

function isRichText(value: unknown): boolean {
  const parsed = parseJson(value);
  return parsed && typeof parsed === "object" && parsed.type === "root";
}

function isImageUrl(value: unknown): boolean {
  const stringValue = String(value ?? "");
  return stringValue.startsWith("/uploads/") || stringValue.startsWith("http://") || stringValue.startsWith("https://");
}

function isImageArray(value: unknown): boolean {
  const parsed = parseJson(value);
  return Array.isArray(parsed) && parsed.length > 0 && parsed.every((entry: unknown) => isImageUrl(entry));
}

function isRepeaterArray(value: unknown): boolean {
  const parsed = parseJson(value);
  return Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === "object" && parsed[0] !== null;
}

function renderImage(src: string): string {
  if (src.startsWith("/uploads/")) {
    return `<img src="${esc(cmsImage(src, 1024))}" srcset="${esc(cmsSrcset(src))}" sizes="(max-width: 768px) 100vw, 768px" alt="" loading="lazy" class="h-auto w-full rounded-lg object-cover" />`;
  }
  return `<img src="${esc(src)}" alt="" loading="lazy" class="w-full rounded-lg object-cover" />`;
}

function renderFieldValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "";

  const parsed = parseJson(value);

  if (isRichText(value)) {
    return `<div class="prose">${renderRichText(parsed)}</div>`;
  }

  if (isImageArray(value)) {
    const images = Array.isArray(parsed) ? parsed : [];
    return `<div class="grid gap-4">${images.map((src: unknown) => renderImage(String(src))).join("")}</div>`;
  }

  if (isImageUrl(value)) {
    return renderImage(String(value));
  }

  if (isRepeaterArray(value)) {
    const items = Array.isArray(parsed) ? parsed : [];
    let html = `<div class="grid gap-3">`;
    for (const item of items) {
      html += `<div class="rounded-lg border border-gray-200 bg-gray-50 px-5 py-4">`;
      for (const [itemKey, itemValue] of Object.entries(item)) {
        if (itemKey === "_key" || itemKey === "id" || !itemValue) continue;
        const className =
          itemKey.includes("description") || itemKey.includes("answer") || itemKey.includes("body")
            ? "m-0 text-gray-500"
            : "mb-1 font-semibold";
        html += `<p class="${className}">${esc(itemValue)}</p>`;
      }
      html += `</div>`;
    }
    html += `</div>`;
    return html;
  }

  if (key === "heading" || key === "title") {
    return `<h2 class="mb-3 text-xl font-semibold">${esc(value)}</h2>`;
  }

  if (key === "eyebrow" || key === "label") {
    return `<p class="mb-1 text-xs font-semibold uppercase tracking-wide text-teal-700">${esc(value)}</p>`;
  }

  if (key === "ctaLabel" || key === "ctaHref") {
    return "";
  }

  return `<p class="text-gray-500">${esc(value)}</p>`;
}

export function renderBlock(block: Record<string, any>): string {
  const { type: _type, _key, ...fields } = block;
  let html = `<section>`;

  if (fields.eyebrow) {
    html += renderFieldValue("eyebrow", fields.eyebrow);
  }

  for (const key of ["heading", "title"]) {
    if (fields[key]) {
      html += renderFieldValue(key, fields[key]);
    }
  }

  for (const [key, value] of Object.entries(fields)) {
    if (["eyebrow", "heading", "title", "ctaLabel", "ctaHref"].includes(key)) continue;
    html += renderFieldValue(key, value);
  }

  if (fields.ctaLabel && fields.ctaHref) {
    html += `<a href="${esc(fields.ctaHref)}" class="mt-4 inline-block rounded-md bg-teal-700 px-4 py-2 text-sm text-white no-underline">${esc(fields.ctaLabel)}</a>`;
  }

  html += `</section>`;
  return html;
}

export function renderBlocks(blocks: Array<Record<string, any>>): string {
  return blocks.map(renderBlock).join("");
}
