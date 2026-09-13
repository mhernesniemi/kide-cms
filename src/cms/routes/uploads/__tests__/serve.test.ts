import { describe, expect, it, vi } from "vitest";

const files: Record<string, string> = {
  "/uploads/logo.svg": '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
  "/uploads/photo.jpg": "jpeg-bytes",
  "/uploads/blob.bin": "whatever",
};

vi.mock("../../../core/runtime", () => ({
  getStorage: () => ({
    putFile: async () => {},
    deleteFile: async () => {},
    getFile: async (storagePath: string) => {
      const text = files[storagePath];
      if (text === undefined) return null;
      const bytes = new TextEncoder().encode(text);
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    },
    getFileStream: async (storagePath: string) => {
      if (storagePath.includes("..")) throw new Error(`Invalid storage path: ${storagePath}`);
      const text = files[storagePath];
      if (text === undefined) return null;
      return { body: new Response(text).body!, size: new TextEncoder().encode(text).byteLength };
    },
  }),
}));

const { GET } = await import("../[...path]");

const get = (path: string) => GET({ params: { path } } as never);

describe("GET /uploads/[...path]", () => {
  it("serves rasters with nosniff and no CSP", async () => {
    const response = await get("photo.jpg");
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/jpeg");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("Content-Security-Policy")).toBeNull();
  });

  it("sandboxes SVG so a direct navigation cannot run script on the site origin", async () => {
    const response = await get("logo.svg");
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/svg+xml");
    expect(response.headers.get("Content-Security-Policy")).toBe("sandbox");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("marks unknown types as octet-stream and never lets the browser sniff them", async () => {
    const response = await get("blob.bin");
    expect(response.headers.get("Content-Type")).toBe("application/octet-stream");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("answers a storage-adapter rejection (traversal) with the same 404 as a missing file", async () => {
    expect((await get("../data/cms.db")).status).toBe(404);
    expect((await get("missing.png")).status).toBe(404);
  });
});
