import { describe, expect, it } from "vitest";
import { blankBlockFields, getPreviewText } from "../block-values";
import type { SubFieldMeta } from "../block-fields";

const meta = (type: string): SubFieldMeta => ({ type });

describe("getPreviewText", () => {
  it("prefers text, then rich text, then an image file name", () => {
    const fields = { image: meta("image"), body: meta("richText"), caption: meta("text") };
    expect(getPreviewText({ image: "/uploads/a.jpg", body: "", caption: "Hello" }, fields)).toBe("Hello");

    const richText = { type: "root", children: [{ type: "paragraph", children: [{ type: "text", value: "Varaa  kierros" }] }] };
    expect(getPreviewText({ image: "/uploads/a.jpg", body: richText, caption: "" }, fields)).toBe("Varaa kierros");
    expect(getPreviewText({ image: "/uploads/a.jpg", body: JSON.stringify(richText) }, fields)).toBe("Varaa kierros");

    expect(getPreviewText({ image: "/uploads/showroom.jpg", body: { type: "root", children: [] } }, fields)).toBe(
      "showroom.jpg",
    );
    expect(getPreviewText({}, fields)).toBe("");
  });

  it("clips long previews", () => {
    expect(getPreviewText({ caption: "x".repeat(80) }, { caption: meta("text") })).toBe(`${"x".repeat(60)}...`);
  });
});

describe("blankBlockFields", () => {
  it("starts nested block lists and arrays empty", () => {
    expect(blankBlockFields({ items: meta("blocks"), tags: meta("array"), on: meta("boolean"), title: meta("text") })).toEqual({
      items: [],
      tags: [],
      on: false,
      title: "",
    });
  });
});
