import type { ImagePreset } from "./define";

const ALLOWED_WIDTHS = [320, 480, 640, 768, 960, 1024, 1280, 1536, 1920];
const ALLOWED_FORMATS = ["webp", "avif", "jpeg", "png"] as const;

type Format = (typeof ALLOWED_FORMATS)[number];

/** Built-in renditions. Config presets in cms.config.ts are merged over these. */
export const DEFAULT_PRESETS: Record<string, ImagePreset> = {
  hero: { aspect: "21/9", widths: [768, 1024, 1280, 1920], formats: ["avif", "webp"], sizes: "100vw" },
  heroMobile: { aspect: "4/5", widths: [480, 768], formats: ["avif", "webp"], sizes: "100vw" },
  banner: { aspect: "16/9", widths: [640, 960, 1280, 1920], formats: ["avif", "webp"], sizes: "100vw" },
  card: {
    aspect: "16/9",
    widths: [320, 480, 640],
    formats: ["avif", "webp"],
    sizes: "(max-width: 768px) 100vw, 33vw",
  },
  square: {
    aspect: "1/1",
    widths: [320, 480, 640],
    formats: ["avif", "webp"],
    sizes: "(max-width: 768px) 100vw, 50vw",
  },
  thumb: { aspect: "1/1", widths: [320, 480], formats: ["webp"], sizes: "192px" },
  // No aspect → resize only, preserving the source's natural ratio.
  content: { widths: [480, 768, 1024, 1280], formats: ["avif", "webp"], sizes: "(max-width: 768px) 100vw, 768px" },
};

const FALLBACK_PRESET: ImagePreset = { widths: [480, 768, 1024, 1280], formats: ["avif", "webp"], sizes: "100vw" };

/** Resolve a preset by name: config override → built-in default → generic full-width fallback. */
export function resolveImagePreset(name: string, overrides?: Record<string, ImagePreset>): ImagePreset {
  return overrides?.[name] ?? DEFAULT_PRESETS[name] ?? FALLBACK_PRESET;
}

export type CropOptions = {
  /** Aspect ratio as "W/H" (e.g. "21/9"). When set, the image is cover-cropped to this ratio. */
  aspect?: string;
  /** Focal point as 0–100 percentages. Crop is centered on this point and clamped to stay in frame. */
  focalX?: number | null;
  focalY?: number | null;
};

// Unlike width, height has no preset list to snap to and is caller-supplied.
const MAX_HEIGHT = 4320;

function clampHeight(height: number): number {
  return Math.min(Math.max(1, Math.round(height)), MAX_HEIGHT);
}

function clampPercent(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(Math.max(0, Math.round(value)), 100);
}

function clampWidth(width: number): number {
  return ALLOWED_WIDTHS.reduce((prev, curr) => (Math.abs(curr - width) < Math.abs(prev - width) ? curr : prev));
}

/** Parse "21/9", "21:9" or "21x9" into a numeric ratio. Returns undefined when malformed. */
function parseAspect(aspect?: string): number | undefined {
  if (!aspect) return undefined;
  const [w, h] = aspect.split(/[/:x]/).map(Number);
  if (!w || !h || !isFinite(w) || !isFinite(h)) return undefined;
  return w / h;
}

function isCloudflare(): boolean {
  return typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers";
}

/**
 * Builds a URL for one rendition. This is the low-level primitive — it cannot
 * read the asset record, so it knows nothing about the stored focal point or the
 * intrinsic dimensions, and it does not check that the upload still exists.
 *
 * To render an image, use `<CmsImage>`, which does all three. Reach for this only
 * when you need a string rather than an element: og:image, CSS background-image,
 * JSON-LD, email HTML.
 */
export function cmsImageUrl(src: string, width?: number, format: Format = "webp", crop?: CropOptions): string {
  if (!src) return "";

  const ratio = parseAspect(crop?.aspect);
  const clamped = width ? clampWidth(width) : undefined;
  const height = clamped && ratio ? Math.round(clamped / ratio) : undefined;
  const hasFocal = crop?.focalX != null && crop?.focalY != null;

  if (isCloudflare()) {
    const parts: string[] = [];
    if (clamped) parts.push(`width=${clamped}`);
    if (height) parts.push(`height=${height}`, "fit=cover");
    if (height)
      parts.push(
        hasFocal ? `gravity=${(crop!.focalX! / 100).toFixed(2)}x${(crop!.focalY! / 100).toFixed(2)}` : "gravity=auto",
      );
    parts.push(`format=${format}`);
    parts.push("quality=80");
    return `/cdn-cgi/image/${parts.join(",")}${src}`;
  }

  const params = new URLSearchParams();
  if (clamped) params.set("w", String(clamped));
  if (height) params.set("h", String(height));
  if (height && hasFocal) {
    params.set("fx", String(Math.round(crop!.focalX!)));
    params.set("fy", String(Math.round(crop!.focalY!)));
  }
  if (format !== "webp") params.set("f", format);
  const qs = params.toString();
  return `/api/cms/img${src}${qs ? `?${qs}` : ""}`;
}

export function cmsSrcset(
  src: string,
  widths: number[] = [480, 768, 1024, 1280],
  format: Format = "webp",
  crop?: CropOptions,
): string {
  if (!src) return "";
  return widths.map((width) => `${cmsImageUrl(src, width, format, crop)} ${width}w`).join(", ");
}

export type TransformOptions = {
  width?: number;
  height?: number;
  format?: string;
  quality?: number;
  focalX?: number | null;
  focalY?: number | null;
};

export async function transformImage(
  src: string,
  options: TransformOptions = {},
): Promise<{ buffer: Buffer; contentType: string } | null> {
  const { existsSync, mkdirSync, readFileSync } = await import("node:fs");
  const { writeFile } = await import("node:fs/promises");
  const path = await import("node:path");
  const sharpModule = "sharp";
  const sharp = (await import(/* @vite-ignore */ sharpModule)).default;

  // Must match the storage adapter: the source lives wherever uploads are written.
  const uploadsDir = process.env.CMS_UPLOADS_DIR
    ? path.resolve(process.env.CMS_UPLOADS_DIR)
    : path.join(process.cwd(), "public", "uploads");
  const cacheDir = path.join(process.cwd(), ".cms-cache", "img");

  // Resolve the source safely under uploadsDir, rejecting traversal.
  const rel = src.replace(/^\/+/, "").replace(/^uploads(?:\/|$)/, "");
  const filePath = path.resolve(uploadsDir, rel);
  if (filePath !== uploadsDir && !filePath.startsWith(uploadsDir + path.sep)) return null;
  if (!existsSync(filePath)) return null;

  const resolvedFormat: Format = ALLOWED_FORMATS.includes(options.format as Format)
    ? (options.format as Format)
    : "webp";
  const resolvedWidth = options.width ? clampWidth(options.width) : undefined;
  const resolvedHeight = options.height ? clampHeight(options.height) : undefined;
  // Snapped to whole numbers: these are cache-key inputs on a route that needs no session,
  // so continuous values would let one image mint unlimited cache entries.
  const resolvedQuality = clampPercent(options.quality ?? 80, 80);
  const crop = resolvedWidth != null && resolvedHeight != null;
  const focalX = crop && options.focalX != null ? clampPercent(options.focalX, 50) : null;
  const focalY = crop && options.focalY != null ? clampPercent(options.focalY, 50) : null;

  if (!existsSync(cacheDir)) mkdirSync(cacheDir, { recursive: true });
  const safeName = src.replace(/[^a-zA-Z0-9.-]/g, "_");
  const autoCrop = crop && focalX == null && focalY == null;
  const focalKey = crop ? (autoCrop ? "_fauto" : `_f${focalX ?? "c"}-${focalY ?? "c"}`) : "";
  const cacheKey = `${safeName}_${resolvedWidth ?? 0}x${resolvedHeight ?? 0}${focalKey}_q${resolvedQuality}.${resolvedFormat}`;
  const cachePath = path.join(cacheDir, cacheKey);

  if (existsSync(cachePath)) {
    return {
      buffer: readFileSync(cachePath),
      contentType: `image/${resolvedFormat}`,
    };
  }

  let pipeline = sharp(readFileSync(filePath));

  if (autoCrop) {
    pipeline = pipeline.resize(resolvedWidth!, resolvedHeight!, {
      fit: "cover",
      position: sharp.strategy.attention,
    });
  } else if (crop) {
    // Focal-aware cover crop: pick the largest source window matching the target
    // aspect, positioned so the focal point stays framed, then resize to target.
    const meta = await pipeline.metadata();
    const sw = meta.width;
    const sh = meta.height;
    if (sw && sh) {
      const targetAspect = resolvedWidth! / resolvedHeight!;
      const sourceAspect = sw / sh;
      let cropW: number;
      let cropH: number;
      if (sourceAspect > targetAspect) {
        cropH = sh;
        cropW = Math.round(sh * targetAspect);
      } else {
        cropW = sw;
        cropH = Math.round(sw / targetAspect);
      }
      const fx = (focalX ?? 50) / 100;
      const fy = (focalY ?? 50) / 100;
      const left = Math.max(0, Math.min(Math.round(fx * sw - cropW / 2), sw - cropW));
      const top = Math.max(0, Math.min(Math.round(fy * sh - cropH / 2), sh - cropH));
      pipeline = pipeline.extract({ left, top, width: cropW, height: cropH }).resize(resolvedWidth!, resolvedHeight!);
    } else {
      pipeline = pipeline.resize(resolvedWidth!, resolvedHeight!, { fit: "cover" });
    }
  } else if (resolvedWidth) {
    pipeline = pipeline.resize(resolvedWidth, undefined, { withoutEnlargement: true });
  }

  pipeline = pipeline.toFormat(resolvedFormat, { quality: resolvedQuality });

  const buffer = await pipeline.toBuffer();
  writeFile(cachePath, buffer).catch(() => {});

  return {
    buffer,
    contentType: `image/${resolvedFormat}`,
  };
}
