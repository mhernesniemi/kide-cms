import { cmsImage, cmsSrcset } from "./image";
import { renderRichText } from "./richtext";

function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function parseArray(val: unknown): any[] {
  if (Array.isArray(val)) return val;
  if (typeof val === "string") {
    try {
      const p = JSON.parse(val);
      return Array.isArray(p) ? p : [];
    } catch {
      return [];
    }
  }
  return [];
}

function parseRichText(val: unknown): string {
  try {
    const parsed = typeof val === "string" ? JSON.parse(val) : val;
    if (parsed?.type === "root") return renderRichText(parsed);
  } catch {}
  return "";
}

function renderBlock(block: Record<string, any>): string {
  if (block.type === "hero") {
    let html = `<section class="my-6 rounded-xl border border-gray-200 bg-gray-50 px-8 py-6">`;
    if (block.eyebrow)
      html += `<p class="mb-1 text-xs font-semibold uppercase tracking-wide text-teal-700">${esc(block.eyebrow)}</p>`;
    html += `<h2 class="mb-2 text-2xl font-bold">${esc(block.heading)}</h2>`;
    if (block.body) html += `<p class="mb-4 text-gray-500">${esc(block.body)}</p>`;
    if (block.ctaLabel && block.ctaHref)
      html += `<a href="${esc(block.ctaHref)}" class="inline-block rounded-md bg-teal-700 px-4 py-2 text-sm text-white no-underline">${esc(block.ctaLabel)}</a>`;
    html += `</section>`;
    return html;
  }

  if (block.type === "text") {
    let html = `<section class="py-8">`;
    if (block.heading) html += `<h2 class="mb-3 text-xl font-semibold">${esc(block.heading)}</h2>`;
    if (block.content) html += `<div class="prose">${parseRichText(block.content)}</div>`;
    html += `</section>`;
    return html;
  }

  if (block.type === "gallery" || block.type === "image") {
    const images = parseArray(block.images);
    if (!images.length) return "";
    let html = `<section class="py-8"><div class="grid gap-4">`;
    for (const src of images) {
      const s = String(src);
      const isLocal = s.startsWith("/uploads/");
      if (isLocal) {
        html += `<img src="${esc(cmsImage(s, 1024))}" srcset="${esc(cmsSrcset(s))}" sizes="(max-width: 768px) 100vw, 768px" alt="" loading="lazy" class="h-auto w-full rounded-lg object-cover" />`;
      } else {
        html += `<img src="${esc(s)}" alt="" loading="lazy" class="w-full rounded-lg object-cover" />`;
      }
    }
    html += `</div></section>`;
    return html;
  }

  if (block.type === "faq") {
    const items = parseArray(block.items);
    let html = `<section class="py-8">`;
    if (block.heading) html += `<h2 class="mb-4 text-xl font-semibold">${esc(block.heading)}</h2>`;
    if (items.length) {
      html += `<div class="grid gap-3">`;
      for (const item of items) {
        html += `<div class="rounded-lg border border-gray-200 bg-gray-50 px-5 py-4">`;
        if (item.title) html += `<p class="mb-1 font-semibold">${esc(item.title)}</p>`;
        if (item.description) html += `<p class="m-0 text-gray-500">${esc(item.description)}</p>`;
        html += `</div>`;
      }
      html += `</div>`;
    }
    html += `</section>`;
    return html;
  }

  return "";
}

export function renderBlocks(blocks: Array<Record<string, any>>): string {
  return blocks.map(renderBlock).join("");
}
