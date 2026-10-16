import { assets, cmsImageUrl, cmsSrcset, resolveImagePreset } from "@kidecms/core";
import type { CropOptions, ImagePreset } from "@kidecms/core";
import config from "@/cms/cms.config";

export type PictureData =
  | { kind: "picture"; sources: Array<{ media?: string; srcset: string; type: string; sizes?: string }>; img: ImgData }
  | { kind: "img"; img: ImgData };
type ImgData = { src: string; width?: number; height?: number; style?: string };

type PictureOptions = {
  /** Rendition for the fallback <img> and the default <source> set. */
  preset?: string;
  /** Art-directed sources: each breakpoint gets a different crop. First match wins. */
  art?: Array<{ media: string; preset: string }>;
  /** Focal point override (0–100). When omitted, falls back to the asset's stored focal point. */
  focalX?: number | null;
  focalY?: number | null;
  /** Overrides the base preset's `sizes`. */
  sizes?: string;
};

function parseRatio(a?: string): number | undefined {
  if (!a) return undefined;
  const [w, h] = a.split(/[/:x]/).map(Number);
  return w && h ? w / h : undefined;
}

/**
 * Server half of <CmsImage>: resolves the asset's stored focal point and intrinsic
 * size, and builds AVIF + WebP sources. Returns null when the upload is gone, so
 * nothing renders instead of a broken image.
 */
export async function cmsPicture(src: string, options: PictureOptions = {}): Promise<PictureData | null> {
  const isUpload = typeof src === "string" && src.startsWith("/uploads/");
  if (!isUpload) return { kind: "img", img: { src } };
  const asset = await assets.findByUrl(src);
  if (!asset) return null;

  const focalX = options.focalX ?? asset.focalX ?? null;
  const focalY = options.focalY ?? asset.focalY ?? null;
  const configPresets = config.images?.presets;
  const base = resolveImagePreset(options.preset ?? "banner", configPresets);

  const sources: Array<{ media?: string; srcset: string; type: string; sizes?: string }> = [];
  const addPreset = (p: ImagePreset, media: string | undefined, sizes: string | undefined) => {
    const crop: CropOptions = { aspect: p.aspect, focalX, focalY };
    for (const format of p.formats ?? ["avif", "webp"]) {
      sources.push({ media, srcset: cmsSrcset(src, p.widths, format, crop), type: `image/${format}`, sizes });
    }
  };
  // Art-directed breakpoints first (more specific), then the base rendition.
  for (const entry of options.art ?? []) {
    const p = resolveImagePreset(entry.preset, configPresets);
    addPreset(p, entry.media, p.sizes);
  }
  addPreset(base, undefined, options.sizes ?? base.sizes);

  // Intrinsic dimensions for the fallback <img> — prevents layout shift (CLS).
  const width = base.widths[Math.floor(base.widths.length / 2)] ?? base.widths[0];
  const ratio = parseRatio(base.aspect) ?? (asset.width && asset.height ? asset.width / asset.height : undefined);
  return {
    kind: "picture",
    sources,
    img: {
      src: cmsImageUrl(src, width, "webp", { aspect: base.aspect, focalX, focalY }),
      width,
      height: ratio ? Math.round(width / ratio) : undefined,
      // Carry the focal point through for CSS object-cover crops in the browser.
      style: focalX != null && focalY != null ? `object-position: ${focalX}% ${focalY}%` : undefined,
    },
  };
}
