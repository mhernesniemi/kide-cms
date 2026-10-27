import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { configureCmsRuntime, resetCmsRuntime } from "../../../core/runtime";
import { deleteFile, getFile, getFileStream, putFile } from "../storage";

let env: Record<string, string>;
let calls: Request[];
let respond: (req: Request) => Response;

beforeEach(() => {
  env = {
    S3_BUCKET: "media",
    S3_ACCESS_KEY_ID: "AKID",
    S3_SECRET_ACCESS_KEY: "secret",
    S3_REGION: "europe-1",
    S3_ENDPOINT: "https://abc123.upcloudobjects.com/",
  };
  configureCmsRuntime({ getDb: async () => null, storage: {} as never, env: (k) => env[k] });
  calls = [];
  respond = () => new Response(null, { status: 200 });
  vi.stubGlobal("fetch", async (input: Request) => {
    calls.push(input);
    return respond(input);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetCmsRuntime();
});

describe("s3 storage", () => {
  it("signs a path-style PUT against a custom endpoint", async () => {
    await putFile("/uploads/a b.jpg", new Uint8Array([1, 2, 3]));
    const req = calls[0];
    expect(req.method).toBe("PUT");
    expect(req.url).toBe("https://abc123.upcloudobjects.com/media/uploads/a%20b.jpg");
    expect(req.headers.get("authorization")).toMatch(/^AWS4-HMAC-SHA256 Credential=AKID\/\d{8}\/europe-1\/s3\//);
  });

  it("uses virtual-hosted AWS URLs without an endpoint, and applies the prefix", async () => {
    delete env.S3_ENDPOINT;
    env.S3_PREFIX = "/site-a/";
    await putFile("/uploads/a.jpg", new Uint8Array([1]));
    expect(calls[0].url).toBe("https://media.s3.europe-1.amazonaws.com/site-a/uploads/a.jpg");
  });

  it("returns bytes and streams, and null for missing keys", async () => {
    respond = (req) =>
      req.url.endsWith("/missing.jpg") ? new Response("NoSuchKey", { status: 404 }) : new Response("hello");
    expect(new TextDecoder().decode((await getFile("/uploads/a.txt"))!)).toBe("hello");
    expect(await getFile("/uploads/missing.jpg")).toBeNull();

    const stream = await getFileStream("/uploads/a.txt");
    expect(await new Response(stream!.body).text()).toBe("hello");
    expect(await getFileStream("/uploads/missing.jpg")).toBeNull();
  });

  it("throws on other error statuses", async () => {
    respond = () => new Response("AccessDenied", { status: 403 });
    await expect(getFile("/uploads/a.jpg")).rejects.toThrow(/403/);
    await expect(deleteFile("/uploads/a.jpg")).rejects.toThrow(/403/);
  });

  it("rejects dot segments before any request", async () => {
    await expect(getFile("/uploads/../secret.txt")).rejects.toThrow(/Invalid storage path/);
    await expect(putFile("/uploads/./a.jpg", new Uint8Array([1]))).rejects.toThrow(/Invalid storage path/);
    expect(calls).toHaveLength(0);
  });

  it("explains missing credentials", async () => {
    delete env.S3_SECRET_ACCESS_KEY;
    await expect(getFile("/uploads/a.jpg")).rejects.toThrow(/S3_SECRET_ACCESS_KEY/);
  });
});
