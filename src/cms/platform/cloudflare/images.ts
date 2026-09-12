import { trackTask } from "../../core/request-scope";
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

// The Workers Cache API. Absent outside workerd; a no-op on *.workers.dev (only
// custom domains have a functional edge cache), where the browser cache still
// applies via the immutable headers below.
const edgeCache = (): Cache | undefined =>
  typeof caches !== "undefined" ? (caches as CacheStorage & { default?: Cache }).default : undefined;

/**
 * Resizes an upload with the Cloudflare Images binding (`env.IMAGES`, which
 * `@astrojs/cloudflare` declares on every build) and streams the result.
 *
 * This is how every `/api/cms/img` URL — public renditions from `<CmsImage>`,
 * admin thumbnails, hand-written URLs — is served on Workers, where sharp isn't
 * available. Renditions are stored in the edge cache keyed by URL, so a given
 * size is transformed once per location rather than per page view.
 *
 * Returns null when the binding or the object is missing so the route can fall
 * back to the original.
 */
export async function resizeWithImagesBinding(
  request: Request,
  storagePath: string,
  options: ImageResizeOptions,
): Promise<Response | null> {
  const env = await getCfEnv();
  const images = env.IMAGES;
  const bucket = env.CMS_ASSETS;
  if (!images || !bucket) return null;

  // Headers don't affect the rendition, so key on the URL alone.
  const cache = edgeCache();
  const cacheKey = new Request(request.url, { method: "GET" });
  const cached = await cache?.match(cacheKey);
  if (cached) return cached;

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

  const response = new Response(result.image(), {
    headers: {
      "Content-Type": result.contentType(),
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
  // Write-through after the response starts streaming; waitUntil keeps it alive.
  if (cache) trackTask(cache.put(cacheKey, response.clone()));
  return response;
}
