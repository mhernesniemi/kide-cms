import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { cmsImage, cmsSrcset, DEFAULT_PRESETS, resolveImagePreset, transformImage } from "../image";

describe("cmsImage", () => {
  it("returns empty string for empty src", () => {
    expect(cmsImage("", 800)).toBe("");
  });

  it("builds a transform URL with snapped width", () => {
    // 800 snaps to nearest allowed width (768)
    expect(cmsImage("/uploads/a.jpg", 800)).toBe("/api/cms/img/uploads/a.jpg?w=768");
  });

  it("omits format param for the webp default and includes it otherwise", () => {
    expect(cmsImage("/uploads/a.jpg", 320)).not.toContain("f=");
    expect(cmsImage("/uploads/a.jpg", 320, "avif")).toContain("f=avif");
  });

  it("derives height from aspect ratio", () => {
    // w=1280, aspect 21/9 → h=549
    const url = cmsImage("/uploads/a.jpg", 1280, "webp", { aspect: "21/9" });
    expect(url).toContain("w=1280");
    expect(url).toContain("h=549");
  });

  it("includes focal params only when cropping", () => {
    const cropped = cmsImage("/uploads/a.jpg", 1280, "webp", { aspect: "16/9", focalX: 30, focalY: 70 });
    expect(cropped).toContain("fx=30");
    expect(cropped).toContain("fy=70");

    // No aspect → no crop → focal params are meaningless and omitted
    const uncropped = cmsImage("/uploads/a.jpg", 1280, "webp", { focalX: 30, focalY: 70 });
    expect(uncropped).not.toContain("fx=");
  });

  it("accepts aspect in /, : and x notations", () => {
    for (const aspect of ["16/9", "16:9", "16x9"]) {
      expect(cmsImage("/uploads/a.jpg", 1280, "webp", { aspect })).toContain("h=720");
    }
  });

  it("ignores malformed aspect ratios", () => {
    expect(cmsImage("/uploads/a.jpg", 1280, "webp", { aspect: "wide" })).not.toContain("h=");
    expect(cmsImage("/uploads/a.jpg", 1280, "webp", { aspect: "16/0" })).not.toContain("h=");
  });
});

describe("cmsSrcset", () => {
  it("emits one candidate per width with descriptors", () => {
    const srcset = cmsSrcset("/uploads/a.jpg", [480, 960]);
    expect(srcset).toBe("/api/cms/img/uploads/a.jpg?w=480 480w, /api/cms/img/uploads/a.jpg?w=960 960w");
  });

  it("keeps a consistent aspect across all candidates", () => {
    const srcset = cmsSrcset("/uploads/a.jpg", [480, 960], "webp", { aspect: "1/1" });
    expect(srcset).toContain("w=480&h=480");
    expect(srcset).toContain("w=960&h=960");
  });

  it("returns empty string for empty src", () => {
    expect(cmsSrcset("")).toBe("");
  });
});

describe("resolveImagePreset", () => {
  it("returns built-in defaults by name", () => {
    expect(resolveImagePreset("hero")).toBe(DEFAULT_PRESETS.hero);
  });

  it("prefers config overrides over defaults", () => {
    const override = { aspect: "2/1", widths: [640] };
    expect(resolveImagePreset("hero", { hero: override })).toBe(override);
  });

  it("falls back to a generic preset for unknown names", () => {
    const preset = resolveImagePreset("nonexistent");
    expect(preset.widths.length).toBeGreaterThan(0);
    expect(preset.aspect).toBeUndefined();
  });
});

describe("transformImage", () => {
  const publicDir = path.join(process.cwd(), "public");
  const fixtureRel = "/uploads/__vitest-fixture__.png";
  const fixtureAbs = path.join(publicDir, fixtureRel);
  const cacheDir = path.join(process.cwd(), ".cms-cache", "img");

  const cleanCache = () => {
    if (!existsSync(cacheDir)) return;
    for (const file of readdirSync(cacheDir)) {
      if (file.includes("__vitest-fixture__")) rmSync(path.join(cacheDir, file));
    }
  };

  beforeAll(async () => {
    // 200×400 portrait test image
    mkdirSync(path.dirname(fixtureAbs), { recursive: true });
    const buffer = await sharp({
      create: { width: 200, height: 400, channels: 3, background: { r: 200, g: 30, b: 30 } },
    })
      .png()
      .toBuffer();
    writeFileSync(fixtureAbs, buffer);
    cleanCache();
  });

  afterAll(() => {
    rmSync(fixtureAbs, { force: true });
    cleanCache();
  });

  it("returns null for missing files", async () => {
    expect(await transformImage("/uploads/__does-not-exist__.png")).toBeNull();
  });

  it("rejects path traversal outside public/", async () => {
    expect(await transformImage("/../package.json")).toBeNull();
    expect(await transformImage("/uploads/../../package.json")).toBeNull();
  });

  it("resizes without cropping when only width is given, preserving aspect", async () => {
    const result = await transformImage(fixtureRel, { width: 320 });
    expect(result).not.toBeNull();
    const meta = await sharp(result!.buffer).metadata();
    // Source is 200px wide; withoutEnlargement keeps it at 200, ratio preserved
    expect(meta.width).toBe(200);
    expect(meta.height).toBe(400);
    expect(meta.format).toBe("webp");
  });

  it("cover-crops to exact dimensions when width+height are given", async () => {
    const result = await transformImage(fixtureRel, { width: 320, height: 137 });
    expect(result).not.toBeNull();
    const meta = await sharp(result!.buffer).metadata();
    expect(meta.width).toBe(320);
    expect(meta.height).toBe(137);
  });

  it("produces different output for different focal points", async () => {
    // Paint the fixture asymmetrically: top half red, bottom half blue
    const top = await sharp({ create: { width: 200, height: 200, channels: 3, background: { r: 255, g: 0, b: 0 } } })
      .png()
      .toBuffer();
    const composite = await sharp({
      create: { width: 200, height: 400, channels: 3, background: { r: 0, g: 0, b: 255 } },
    })
      .composite([{ input: top, top: 0, left: 0 }])
      .png()
      .toBuffer();
    writeFileSync(fixtureAbs, composite);
    cleanCache();

    const focalTop = await transformImage(fixtureRel, { width: 320, height: 137, focalY: 0, focalX: 50 });
    const focalBottom = await transformImage(fixtureRel, { width: 320, height: 137, focalY: 100, focalX: 50 });

    const topStats = await sharp(focalTop!.buffer).stats();
    const bottomStats = await sharp(focalBottom!.buffer).stats();
    // focalY=0 crops the red top; focalY=100 crops the blue bottom
    expect(topStats.channels[0].mean).toBeGreaterThan(200); // red channel
    expect(bottomStats.channels[2].mean).toBeGreaterThan(200); // blue channel
  });

  it("respects format and reports matching content type", async () => {
    const result = await transformImage(fixtureRel, { width: 320, format: "jpeg" });
    expect(result!.contentType).toBe("image/jpeg");
    const meta = await sharp(result!.buffer).metadata();
    expect(meta.format).toBe("jpeg");
  });

  it("falls back to webp for unknown formats", async () => {
    const result = await transformImage(fixtureRel, { width: 320, format: "bmp" });
    expect(result!.contentType).toBe("image/webp");
  });
});
