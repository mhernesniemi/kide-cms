import { describe, expect, it } from "vitest";

import { PayloadTooLargeError, readLimitedFormData } from "../http";

/** A Request whose body streams (no Content-Length) — the case a header-only check misses. */
const streamingFormRequest = (fields: Record<string, string>) => {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  const encoded = new Request("http://example.test/", { method: "POST", body: form });
  return new Request("http://example.test/", {
    method: "POST",
    headers: { "content-type": encoded.headers.get("content-type")! }, // Content-Length dropped
    body: encoded.body,
    duplex: "half",
  } as RequestInit);
};

describe("readLimitedFormData", () => {
  it("parses a normal-sized streaming body", async () => {
    const request = streamingFormRequest({ field: "hello" });
    const form = await readLimitedFormData(request, 1024);
    expect(form.get("field")).toBe("hello");
  });

  it("rejects a body larger than the cap even without Content-Length", async () => {
    const request = streamingFormRequest({ field: "x".repeat(500_000) });
    await expect(readLimitedFormData(request, 1024)).rejects.toThrow(PayloadTooLargeError);
  });
});
