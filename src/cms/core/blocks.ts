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
    let html = `<section style="background: #f8f9fa; border: 1px solid #e5e7eb; border-radius: 0.75rem; padding: 1.5rem 2rem; margin: 1.5rem 0;">`;
    if (block.eyebrow)
      html += `<p style="color: #0f766e; font-size: 0.8rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; margin: 0 0 0.25rem;">${esc(block.eyebrow)}</p>`;
    html += `<h2 style="font-size: 1.5rem; font-weight: 700; margin: 0 0 0.5rem;">${esc(block.heading)}</h2>`;
    if (block.body) html += `<p style="color: #666; margin: 0 0 1rem;">${esc(block.body)}</p>`;
    if (block.ctaLabel && block.ctaHref)
      html += `<a href="${esc(block.ctaHref)}" style="display: inline-block; background: #0f766e; color: white; padding: 0.4rem 1rem; border-radius: 0.375rem; text-decoration: none; font-size: 0.85rem;">${esc(block.ctaLabel)}</a>`;
    html += `</section>`;
    return html;
  }

  if (block.type === "text") {
    let html = `<section style="padding: 2rem 0;">`;
    if (block.heading)
      html += `<h2 style="font-size: 1.25rem; font-weight: 600; margin: 0 0 0.75rem;">${esc(block.heading)}</h2>`;
    if (block.content) html += `<div class="prose">${parseRichText(block.content)}</div>`;
    html += `</section>`;
    return html;
  }

  if (block.type === "gallery") {
    const images = parseArray(block.images);
    if (!images.length) return "";
    let html = `<section style="padding: 2rem 0;"><div style="display: grid; gap: 1rem;">`;
    for (const src of images) {
      const s = String(src);
      const isLocal = s.startsWith("/uploads/");
      if (isLocal) {
        html += `<img src="${esc(cmsImage(s, 1024))}" srcset="${esc(cmsSrcset(s))}" sizes="(max-width: 768px) 100vw, 768px" alt="" loading="lazy" style="width: 100%; height: auto; border-radius: 0.5rem; object-fit: cover;" />`;
      } else {
        html += `<img src="${esc(s)}" alt="" loading="lazy" style="width: 100%; border-radius: 0.5rem; object-fit: cover;" />`;
      }
    }
    html += `</div></section>`;
    return html;
  }

  if (block.type === "faq") {
    const items = parseArray(block.items);
    let html = `<section style="padding: 2rem 0;">`;
    if (block.heading)
      html += `<h2 style="font-size: 1.25rem; font-weight: 600; margin: 0 0 1rem;">${esc(block.heading)}</h2>`;
    if (items.length) {
      html += `<div style="display: grid; gap: 0.75rem;">`;
      for (const item of items) {
        html += `<div style="background: #f8f9fa; border: 1px solid #e5e7eb; border-radius: 0.5rem; padding: 1rem 1.25rem;">`;
        if (item.title) html += `<p style="font-weight: 600; margin: 0 0 0.25rem;">${esc(item.title)}</p>`;
        if (item.description) html += `<p style="color: #666; margin: 0;">${esc(item.description)}</p>`;
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
