import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import { deleteFile, getFile, getFileStream, putFile } from "../storage";

// Runs in the real Worker runtime against a miniflare R2 binding (CMS_ASSETS) — catches
// lifecycle/binding bugs a successful `astro build` can't (e.g. locals.runtime.ctx crashes).
describe("cloudflare R2 storage (worker runtime)", () => {
  it("exposes the R2 binding declared in vitest.workers.config.ts", () => {
    expect(env.CMS_ASSETS).toBeDefined();
  });

  it("round-trips a file and streams it back", async () => {
    const storagePath = "/uploads/worker-test.txt";
    const bytes = new TextEncoder().encode("hello from workerd");

    await putFile(storagePath, bytes);

    const buffer = await getFile(storagePath);
    expect(buffer).not.toBeNull();
    expect(new TextDecoder().decode(buffer!)).toBe("hello from workerd");

    const streamed = await getFileStream(storagePath);
    expect(streamed?.size).toBe(bytes.byteLength);
    const read = await new Response(streamed!.body).text();
    expect(read).toBe("hello from workerd");

    await deleteFile(storagePath);
    expect(await getFile(storagePath)).toBeNull();
  });
});
