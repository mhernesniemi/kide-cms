// Binding types for Kide's Cloudflare profile, from the module form of workers-types:
// its global form clashes with the DOM types the admin is checked against.
type D1Database = import("@cloudflare/workers-types/index").D1Database;
type R2Bucket = import("@cloudflare/workers-types/index").R2Bucket;
type ImagesBinding = import("@cloudflare/workers-types/index").ImagesBinding;
type ImageTransform = import("@cloudflare/workers-types/index").ImageTransform;
type ImageOutputOptions = import("@cloudflare/workers-types/index").ImageOutputOptions;

declare module "cloudflare:workers" {
  export const env: unknown;
  export const waitUntil: (promise: Promise<unknown>) => void;
}
