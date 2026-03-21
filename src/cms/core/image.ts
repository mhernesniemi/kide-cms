const ALLOWED_WIDTHS = [320, 480, 640, 768, 960, 1024, 1280, 1536, 1920];
const ALLOWED_FORMATS = ["webp", "avif", "jpeg", "png"] as const;
type Format = (typeof ALLOWED_FORMATS)[number];

function clampWidth(w: number): number {
  return ALLOWED_WIDTHS.reduce((prev, curr) => (Math.abs(curr - w) < Math.abs(prev - w) ? curr : prev));
}

// Detect Cloudflare Workers runtime
function isCloudflare(): boolean {
  return typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers";
}

/**
 * Generate an optimized image URL.
 *
 * Local:      /api/cms/img/uploads/photo.jpg?w=800
 * Cloudflare: /cdn-cgi/image/width=800,format=webp,quality=80/uploads/photo.jpg
 */
export function cmsImage(src: string, width?: number, format: Format = "webp"): string {
  if (!src) return "";

  if (isCloudflare()) {
    const parts: string[] = [];
    if (width) parts.push(`width=${clampWidth(width)}`);
    parts.push(`format=${format}`);
    parts.push("quality=80");
    return `/cdn-cgi/image/${parts.join(",")}${src}`;
  }

  const params = new URLSearchParams();
  if (width) params.set("w", String(clampWidth(width)));
  if (format !== "webp") params.set("f", format);
  const qs = params.toString();
  return `/api/cms/img${src}${qs ? `?${qs}` : ""}`;
}

/**
 * Generate a srcset string for responsive images.
 */
export function cmsSrcset(src: string, widths: number[] = [480, 768, 1024, 1280], format: Format = "webp"): string {
  if (!src) return "";
  return widths.map((w) => `${cmsImage(src, w, format)} ${w}w`).join(", ");
}

// --- Local-only Sharp transformation (not used on Cloudflare) ---

export async function transformImage(
  src: string,
  width?: number,
  format?: string,
  quality?: number,
): Promise<{ buffer: Buffer; contentType: string } | null> {
  const { existsSync, mkdirSync, readFileSync } = await import("node:fs");
  const { writeFile } = await import("node:fs/promises");
  const path = await import("node:path");
  const sharpModule = "sharp";
  const sharp = (await import(/* @vite-ignore */ sharpModule)).default;

  const PUBLIC_DIR = path.join(process.cwd(), "public");
  const CACHE_DIR = path.join(process.cwd(), ".cms-cache", "img");

  const filePath = path.join(PUBLIC_DIR, src);
  if (!existsSync(filePath)) return null;

  const fmt: Format = ALLOWED_FORMATS.includes(format as Format) ? (format as Format) : "webp";
  const w = width ? clampWidth(width) : undefined;
  const q = quality ?? 80;

  // Check cache
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
  const name = src.replace(/[^a-zA-Z0-9.-]/g, "_");
  const key = `${name}_${w ?? 0}.${fmt}`;
  const cachePath = path.join(CACHE_DIR, key);

  if (existsSync(cachePath)) {
    return {
      buffer: readFileSync(cachePath),
      contentType: `image/${fmt === "jpeg" ? "jpeg" : fmt}`,
    };
  }

  let pipeline = sharp(readFileSync(filePath));
  if (w) pipeline = pipeline.resize(w, undefined, { withoutEnlargement: true });
  pipeline = pipeline.toFormat(fmt, { quality: q });

  const buffer = await pipeline.toBuffer();

  writeFile(cachePath, buffer).catch(() => {});

  return {
    buffer,
    contentType: `image/${fmt === "jpeg" ? "jpeg" : fmt}`,
  };
}
