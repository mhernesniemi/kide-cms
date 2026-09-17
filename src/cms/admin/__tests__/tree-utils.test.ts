import { describe, expect, it } from "vitest";
import { collectSlugs, uniqueSlug, type TreeItem } from "../components/tree-utils";

const tree: TreeItem[] = [
  { id: "a", slug: "news", children: [{ id: "b", slug: "guides", children: [] }] },
  { id: "c", slug: "customers", children: [] },
];

describe("collectSlugs", () => {
  it("walks the whole tree", () => {
    expect(collectSlugs(tree)).toEqual(new Set(["news", "guides", "customers"]));
  });

  it("excludes the item being edited so its own slug is not a collision", () => {
    expect(collectSlugs(tree, "a").has("news")).toBe(false);
  });
});

describe("uniqueSlug", () => {
  it("keeps a free slug", () => {
    expect(uniqueSlug("news", new Set(["guides"]))).toBe("news");
  });

  it("suffixes past every taken variant", () => {
    expect(uniqueSlug("news", new Set(["news"]))).toBe("news-2");
    expect(uniqueSlug("news", new Set(["news", "news-2"]))).toBe("news-3");
  });

  it("leaves an empty slug alone", () => {
    expect(uniqueSlug("", new Set(["news"]))).toBe("");
  });
});
