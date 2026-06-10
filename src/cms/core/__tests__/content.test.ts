import { describe, expect, it } from "vitest";

import { cacheTags, parseBlocks, parseList } from "../content";

describe("parseBlocks", () => {
  it("returns arrays as-is", () => {
    const blocks = [{ _type: "hero", heading: "Hi" }];
    expect(parseBlocks(blocks)).toBe(blocks);
  });

  it("parses JSON strings", () => {
    expect(parseBlocks('[{"_type":"hero"}]')).toEqual([{ _type: "hero" }]);
  });

  it("returns [] for null, malformed JSON, and non-arrays", () => {
    expect(parseBlocks(null)).toEqual([]);
    expect(parseBlocks(undefined)).toEqual([]);
    expect(parseBlocks("not json")).toEqual([]);
    expect(parseBlocks('{"a":1}')).toEqual([]);
  });
});

describe("parseList", () => {
  it("returns arrays as-is", () => {
    expect(parseList(["a", "b"])).toEqual(["a", "b"]);
  });

  it("parses JSON array strings", () => {
    expect(parseList('["a","b"]')).toEqual(["a", "b"]);
  });

  it("returns [] for malformed input and non-array values", () => {
    expect(parseList("oops")).toEqual([]);
    expect(parseList(42)).toEqual([]);
    expect(parseList(null)).toEqual([]);
  });
});

describe("cacheTags", () => {
  it("returns collection tag + singularized doc tag", () => {
    expect(cacheTags("posts", "abc")).toEqual(["posts", "post:abc"]);
  });

  it("keeps non-plural collection names as-is for the doc tag", () => {
    expect(cacheTags("news", "abc")).toEqual(["news", "new:abc"]);
  });
});
