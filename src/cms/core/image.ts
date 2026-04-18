const ALLOWED_WIDTHS = [320, 480, 640, 768, 960, 1024, 1280, 1536, 1920];
const ALLOWED_FORMATS = ["webp", "avif", "jpeg", "png"] as const;

type Format = (typeof ALLOWED_FORMATS)[number];

function clampWidth(width: number): number {
  return ALLOWED_WIDTHS.reduce((prev, curr) => (Math.abs(curr - width) < Math.abs(prev - width) ? curr : prev));
}

function isCloudflare(): boolean {
  return typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers";
}

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

export function cmsSrcset(src: string, widths: number[] = [480, 768, 1024, 1280], format: Format = "webp"): string {
  if (!src) return "";
  return widths.map((width) => `${cmsImage(src, width, format)} ${width}w`).join(", ");
}

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

  const publicDir = path.join(process.cwd(), "public");
  const cacheDir = path.join(process.cwd(), ".cms-cache", "img");
  const filePath = path.join(publicDir, src);

  if (!existsSync(filePath)) return null;

  const resolvedFormat: Format = ALLOWED_FORMATS.includes(format as Format) ? (format as Format) : "webp";
  const resolvedWidth = width ? clampWidth(width) : undefined;
  const resolvedQuality = quality ?? 80;

  if (!existsSync(cacheDir)) mkdirSync(cacheDir, { recursive: true });
  const safeName = src.replace(/[^a-zA-Z0-9.-]/g, "_");
  const cacheKey = `${safeName}_${resolvedWidth ?? 0}.${resolvedFormat}`;
  const cachePath = path.join(cacheDir, cacheKey);

  if (existsSync(cachePath)) {
    return {
      buffer: readFileSync(cachePath),
      contentType: `image/${resolvedFormat === "jpeg" ? "jpeg" : resolvedFormat}`,
    };
  }

  let pipeline = sharp(readFileSync(filePath));
  if (resolvedWidth) {
    pipeline = pipeline.resize(resolvedWidth, undefined, { withoutEnlargement: true });
  }
  pipeline = pipeline.toFormat(resolvedFormat, { quality: resolvedQuality });

  const buffer = await pipeline.toBuffer();
  writeFile(cachePath, buffer).catch(() => {});

  return {
    buffer,
    contentType: `image/${resolvedFormat === "jpeg" ? "jpeg" : resolvedFormat}`,
  };
}
