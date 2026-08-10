import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// uploadsDir is read at module load, so each scenario imports storage fresh.
const originalEnv = process.env.CMS_UPLOADS_DIR;
let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(path.join(tmpdir(), "kide-up-"));
});

afterEach(() => {
  if (originalEnv === undefined) delete process.env.CMS_UPLOADS_DIR;
  else process.env.CMS_UPLOADS_DIR = originalEnv;
  vi.resetModules();
  rmSync(tmp, { recursive: true, force: true });
});

async function loadStorage() {
  vi.resetModules();
  return import("../storage");
}

describe("storage upload directory", () => {
  it("writes and reads under CMS_UPLOADS_DIR when set", async () => {
    process.env.CMS_UPLOADS_DIR = tmp;
    const storage = await loadStorage();

    await storage.putFile("/uploads/a.txt", new TextEncoder().encode("hi"));
    expect(existsSync(path.join(tmp, "a.txt"))).toBe(true);

    const got = await storage.getFile("/uploads/a.txt");
    expect(new TextDecoder().decode(new Uint8Array(got!))).toBe("hi");
  });

  it("rejects traversal outside the configured uploads dir", async () => {
    process.env.CMS_UPLOADS_DIR = tmp;
    const storage = await loadStorage();

    await expect(storage.putFile("/uploads/../../evil.txt", new Uint8Array([1]))).rejects.toThrow(
      /Invalid storage path/,
    );
    await expect(storage.getFile("/uploads/../../../etc/passwd")).rejects.toThrow(/Invalid storage path/);
  });

  it("defaults to public/uploads when unset, without escaping the tree", async () => {
    delete process.env.CMS_UPLOADS_DIR;
    const storage = await loadStorage();
    // Resolves cleanly; a missing file returns null rather than writing into the repo.
    expect(await storage.getFile("/uploads/__does_not_exist__.txt")).toBeNull();
  });
});
