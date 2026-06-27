import { describe, expect, it } from "vitest";

import { contentBlocks, contentSegments, contentToPlainText } from "../values";
import type { ContentDocument } from "../define";

const doc: ContentDocument = {
  type: "root",
  children: [
    { type: "paragraph", children: [{ type: "text", value: "Intro" }] },
    { type: "heading", level: 2, children: [{ type: "text", value: "Section" }] },
    { type: "block", blockType: "faq", fields: { heading: "Q&A" } },
    { type: "paragraph", children: [{ type: "text", value: "Outro" }] },
  ],
};

describe("contentSegments", () => {
  it("groups consecutive prose nodes and splits on blocks, preserving order", () => {
    const segments = contentSegments(doc);
    expect(segments.map((s) => s.kind)).toEqual(["richText", "block", "richText"]);

    const first = segments[0];
    expect(first.kind === "richText" && first.doc.children).toHaveLength(2);

    const block = segments[1];
    expect(block.kind === "block" && block.block.blockType).toBe("faq");

    const last = segments[2];
    expect(last.kind === "richText" && last.doc.children).toHaveLength(1);
  });

  it("returns an empty list for missing or malformed documents", () => {
    expect(contentSegments(null)).toEqual([]);
    expect(contentSegments(undefined)).toEqual([]);
    expect(contentSegments({ type: "not-root" } as unknown as ContentDocument)).toEqual([]);
  });

  it("contentToPlainText includes both prose and block-field text", () => {
    const text = contentToPlainText(doc);
    expect(text).toContain("Intro");
    expect(text).toContain("Section");
    // Block field text must not be dropped (it would be by plain richText flattening).
    expect(text).toContain("Q&A");
    expect(text).toContain("Outro");
  });

  it("contentToPlainText surfaces text from block-only documents", () => {
    const blockOnly: ContentDocument = {
      type: "root",
      children: [{ type: "block", blockType: "faq", fields: { heading: "Only a block", items: ["one", "two"] } }],
    };
    const text = contentToPlainText(blockOnly);
    expect(text).toContain("Only a block");
    expect(text).toContain("one");
    expect(text).toContain("two");
  });

  it("contentBlocks extracts only the inline block nodes", () => {
    const blocks = contentBlocks(doc);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].blockType).toBe("faq");
    expect(blocks[0].fields).toEqual({ heading: "Q&A" });
  });
});
