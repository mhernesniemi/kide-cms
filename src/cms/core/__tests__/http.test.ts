import { afterEach, describe, expect, it } from "vitest";

import { PayloadTooLargeError, isPublicUploadPath, publicOrigin, readLimitedFormData, readLimitedText } from "../http";
import { configureCmsRuntime, resetCmsRuntime } from "../runtime";

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

const streamingTextRequest = (text: string) => {
  const encoded = new Request("http://example.test/", { method: "POST", body: text });
  return new Request("http://example.test/", {
    method: "POST",
    body: encoded.body, // Content-Length dropped
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

describe("readLimitedText", () => {
  it("returns the body text when under the cap", async () => {
    expect(await readLimitedText(streamingTextRequest('{"ok":true}'), 1024)).toBe('{"ok":true}');
  });

  it("returns an empty string for a bodiless request", async () => {
    expect(await readLimitedText(new Request("http://example.test/"), 1024)).toBe("");
  });

  it("rejects a body larger than the cap even without Content-Length", async () => {
    const request = streamingTextRequest("x".repeat(500_000));
    await expect(readLimitedText(request, 1024)).rejects.toThrow(PayloadTooLargeError);
  });
});

describe("publicOrigin", () => {
  const env: Record<string, string | undefined> = {};
  const configure = () =>
    configureCmsRuntime({
      getDb: async () => null,
      storage: { putFile: async () => {}, getFile: async () => null, deleteFile: async () => {} },
      env: (key) => env[key],
    });

  afterEach(() => {
    delete env.CMS_TRUSTED_ORIGIN;
    resetCmsRuntime();
  });

  it("falls back to the request origin when CMS_TRUSTED_ORIGIN is unset", () => {
    configure();
    expect(publicOrigin(new Request("https://cms.example/api/cms/auth/forgot-password"))).toBe("https://cms.example");
  });

  it("ignores a forged Host once CMS_TRUSTED_ORIGIN is set (reset-link poisoning)", () => {
    env.CMS_TRUSTED_ORIGIN = "https://cms.example";
    configure();
    expect(publicOrigin(new Request("https://attacker.example/api/cms/auth/forgot-password"))).toBe(
      "https://cms.example",
    );
  });

  it("normalizes the configured value to a bare origin", () => {
    env.CMS_TRUSTED_ORIGIN = "https://cms.example/some/path/";
    configure();
    expect(publicOrigin(new Request("https://attacker.example/"))).toBe("https://cms.example");
  });

  it("falls back to the request origin when the configured value is malformed", () => {
    env.CMS_TRUSTED_ORIGIN = "not a url";
    configure();
    expect(publicOrigin(new Request("https://cms.example/"))).toBe("https://cms.example");
  });
});

describe("isPublicUploadPath", () => {
  it("accepts what assets.upload() writes", () => {
    expect(isPublicUploadPath("/uploads/V1StGXR8_Z5jdHi6.png")).toBe(true);
    expect(isPublicUploadPath("/uploads/sub/file.webp")).toBe(true);
  });

  it("rejects anything outside /uploads/ (arbitrary object-store keys)", () => {
    expect(isPublicUploadPath("/secret/backup.sqlite")).toBe(false);
    expect(isPublicUploadPath("/uploadsx/file.png")).toBe(false);
    expect(isPublicUploadPath("uploads/file.png")).toBe(false);
    expect(isPublicUploadPath("/uploads")).toBe(false);
    expect(isPublicUploadPath("/uploads/")).toBe(false);
  });

  it("rejects dot and empty segments", () => {
    expect(isPublicUploadPath("/uploads/../cms.db")).toBe(false);
    expect(isPublicUploadPath("/uploads/./file.png")).toBe(false);
    expect(isPublicUploadPath("/uploads//file.png")).toBe(false);
    expect(isPublicUploadPath("/uploads/a/../../etc/passwd")).toBe(false);
  });
});
