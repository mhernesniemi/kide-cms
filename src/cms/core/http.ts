export class PayloadTooLargeError extends Error {}

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
