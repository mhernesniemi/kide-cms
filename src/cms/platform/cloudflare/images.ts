import { getCfEnv } from "./cf-env";

// Mirrors core/image.ts's allowed output formats, keyed by the `f=` query value.
const OUTPUT_FORMATS: Record<string, ImageOutputOptions["format"]> = {
  webp: "image/webp",
  avif: "image/avif",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
};

export type ImageResizeOptions = {
  width?: number;
  height?: number;
  format?: string;
  quality?: number;
  focalX?: number | null;
  focalY?: number | null;
};

/**
 * Resizes an upload with the Cloudflare Images binding (`env.IMAGES`, which
 * `@astrojs/cloudflare` declares on every build) and streams the result.
 *
 * Public pages never come here — `cmsImageUrl()` emits `/cdn-cgi/image` URLs on
 * Workers — but the admin's thumbnails and any hand-written `/api/cms/img` URL
 * do, and without this they'd be served the full-size original: sharp isn't
 * available on Workers. Returns null when the binding or the object is missing
 * so the route can fall back to the original.
 */
export async function resizeWithImagesBinding(
  storagePath: string,
  options: ImageResizeOptions,
): Promise<Response | null> {
  const env = await getCfEnv();
  const images = env.IMAGES;
  const bucket = env.CMS_ASSETS;
  if (!images || !bucket) return null;

  const object = await bucket.get(storagePath.replace(/^\/+/, ""));
  if (!object) return null;

  const { width, height } = options;
  const transform: ImageTransform = {};
  if (width) transform.width = width;
  if (height) transform.height = height;
  if (width && height) {
    // Same crop semantics as the /cdn-cgi/image URLs core emits: cover the box,
    // centring it on the stored focal point when there is one.
    transform.fit = "cover";
    transform.gravity =
      options.focalX != null && options.focalY != null
        ? { x: options.focalX / 100, y: options.focalY / 100, mode: "box-center" }
        : "auto";
  }

  const result = await images
    .input(object.body)
    .transform(transform)
    .output({ format: OUTPUT_FORMATS[options.format ?? "webp"] ?? "image/webp", quality: options.quality ?? 80 });

  return new Response(result.image(), {
    headers: {
      "Content-Type": result.contentType(),
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
