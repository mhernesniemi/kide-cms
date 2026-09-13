import { readEnv } from "./runtime";

export class PayloadTooLargeError extends Error {}

/**
 * The origin to put in links we hand out (password-reset and invite emails, SSO
 * redirect_uri). `request.url` is built from the incoming Host header on the Node
 * adapter unless Astro's `security.allowedDomains` is set, so a forged Host would
 * otherwise land in the victim's reset email pointing at the attacker's domain.
 * `CMS_TRUSTED_ORIGIN` pins it; the same value anchors the middleware's CSRF check.
 */
export const publicOrigin = (request: Request): string => {
  const configured = readEnv("CMS_TRUSTED_ORIGIN");
  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
      // Malformed value — fall through to the request's own origin.
    }
  }
  return new URL(request.url).origin;
};

/**
 * Whether a storage path is one the unauthenticated file routes may read. Assets are
 * always written as `/uploads/<id>.<ext>`; anything else (another prefix, an empty or
 * dot segment) is never a served upload. Node's storage adapter rejects traversal on
 * its own, but object stores treat any key as valid — without this, `/api/cms/img/x`
 * would read arbitrary objects from a shared R2 bucket.
 */
export const isPublicUploadPath = (storagePath: string): boolean => {
  if (!storagePath.startsWith("/uploads/")) return false;
  const segments = storagePath.slice("/uploads/".length).split("/");
  return segments.every((segment) => segment !== "" && segment !== "." && segment !== "..");
};

/**
 * Reads a request body as text while enforcing a byte cap on the stream itself (see
 * readLimitedFormData for why Content-Length is not enough). Rejects with
 * `PayloadTooLargeError` when exceeded.
 */
export const readLimitedText = async (request: Request, maxBytes: number): Promise<string> => {
  if (!request.body) return "";

  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = request.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new PayloadTooLargeError(`Body exceeds ${maxBytes} bytes`);
    }
    chunks.push(value);
  }

  const joined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(joined);
};

/**
 * Parses a request body as FormData while enforcing a hard byte cap on the stream itself —
 * unlike checking `Content-Length` (optional, and absent on chunked-encoded requests) or
 * `file.size` after `request.formData()` already buffered the whole body, this aborts mid-stream
 * before more than `maxBytes` have been read. Rejects with `PayloadTooLargeError` when exceeded.
 */
export const readLimitedFormData = async (request: Request, maxBytes: number): Promise<FormData> => {
  if (!request.body) return new FormData();

  let total = 0;
  const reader = request.body.getReader();
  const limited = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        controller.close();
        return;
      }
      total += value.byteLength;
      if (total > maxBytes) {
        controller.error(new PayloadTooLargeError(`Body exceeds ${maxBytes} bytes`));
        await reader.cancel().catch(() => {});
        return;
      }
      controller.enqueue(value);
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });

  const limitedRequest = new Request(request.url, {
    method: request.method,
    headers: request.headers,
    body: limited,
    // @ts-expect-error -- required by the Fetch spec for a streaming request body (Node + Workers).
    duplex: "half",
  });
  return limitedRequest.formData();
};
