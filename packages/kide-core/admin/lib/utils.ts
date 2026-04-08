import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const ALLOWED_WIDTHS = [320, 480, 640, 768, 960, 1024, 1280, 1536, 1920];

function clampWidth(width: number): number {
  return ALLOWED_WIDTHS.reduce((prev, curr) => (Math.abs(curr - width) < Math.abs(prev - width) ? curr : prev));
}

/** Generate a thumbnail URL for an upload path. Works on both local (Sharp) and Cloudflare (Image Transformations). */
export function thumbnail(src: string, width: number = 480): string {
  if (!src || !src.startsWith("/uploads/")) return src;
  const w = clampWidth(width);
  return `/api/cms/img${src}?w=${w}`;
}
