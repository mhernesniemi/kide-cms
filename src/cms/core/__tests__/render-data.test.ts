import { describe, expect, it } from "vitest";
import { resolveBlocks, resolveContent } from "../render-data";
import { SHARED_BLOCK_TYPE } from "../shared-sections";

const fakeCms = (sections: Record<string, { title: string; block: Record<string, unknown> }>) => {
  const calls: Array<{ id: string; status: string }> = [];
  return {
    calls,
    cms: {
      "shared-sections": {
        findById: async (id: string, { status }: { status: string }) => {
          calls.push({ id, status });
          return sections[id] ?? null;
        },
      },
    },
  };
};

const paragraph = (value: string) => ({ type: "paragraph", children: [{ type: "text", value }] });

describe("resolveBlocks", () => {
  it("swaps shared references for their block and passes the status through", async () => {
    const { cms, calls } = fakeCms({ s1: { title: "CTA", block: { type: "cta", label: "Go" } } });
    const blocks = await resolveBlocks(cms, [{ type: "hero" }, { type: SHARED_BLOCK_TYPE, ref: "s1" }], "any");
    expect(blocks).toEqual([
      { type: "hero" },
      { type: "cta", label: "Go", _sharedSection: { id: "s1", title: "CTA" } },
    ]);
    expect(calls).toEqual([{ id: "s1", status: "any" }]);
  });

  it("keeps a placeholder for a missing shared section only in previews", async () => {
    const { cms } = fakeCms({});
    const missing = [{ type: SHARED_BLOCK_TYPE, ref: "gone", title: "Old" }];
    expect(await resolveBlocks(cms, missing, "published")).toEqual([]);
    expect(await resolveBlocks(cms, missing, "any")).toEqual([{ type: SHARED_BLOCK_TYPE, ref: "gone", title: "Old" }]);
  });
});

describe("resolveContent", () => {
  it("renders prose to HTML, keeps blocks in order and trims trailing empty paragraphs", async () => {
    const { cms } = fakeCms({});
    const segments = await resolveContent(cms, {
      type: "root",
      children: [
        paragraph("Intro"),
        { type: "block", blockType: "hero", fields: { heading: "Hi" } },
        paragraph("Outro"),
        { type: "paragraph", children: [] },
      ],
    } as any);
    expect(segments).toEqual([
      { kind: "richText", html: expect.stringContaining("Intro") },
      { kind: "block", blockType: "hero", fields: { heading: "Hi" } },
      { kind: "richText", html: expect.stringContaining("Outro") },
    ]);
  });

  it("inlines shared section blocks and marks missing ones in previews", async () => {
    const { cms } = fakeCms({ s1: { title: "CTA", block: { type: "cta", label: "Go" } } });
    const content = {
      type: "root",
      children: [
        { type: "block", blockType: SHARED_BLOCK_TYPE, fields: { ref: "s1" } },
        { type: "block", blockType: SHARED_BLOCK_TYPE, fields: { ref: "gone" } },
      ],
    } as any;
    expect(await resolveContent(cms, content, "any")).toEqual([
      { kind: "block", blockType: "cta", fields: { label: "Go" } },
      { kind: "missingShared", ref: "gone" },
    ]);
    expect(await resolveContent(cms, content, "published")).toEqual([
      { kind: "block", blockType: "cta", fields: { label: "Go" } },
    ]);
  });

  it("returns nothing for an empty document", async () => {
    expect(await resolveContent(fakeCms({}).cms, null)).toEqual([]);
  });
});
