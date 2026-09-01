import { describe, expect, it } from "vitest";

import { parseItems } from "../tree-utils";

describe("parseItems", () => {
  it("fills in children and ids so imported flat items don't crash the editor", () => {
    const items = parseItems(
      JSON.stringify([
        { id: "a", name: "A", slug: "a" },
        { name: "B", children: [{ name: "C" }] },
      ]),
    );
    expect(items[0]).toEqual({ id: "a", name: "A", slug: "a", children: [] });
    expect(items[1].id).toMatch(/^ti_/);
    expect(items[1].children[0]).toMatchObject({ name: "C", children: [] });
  });

  it("drops non-object entries and tolerates bad JSON", () => {
    expect(parseItems(JSON.stringify([null, "x", { id: "a" }]))).toHaveLength(1);
    expect(parseItems("{")).toEqual([]);
    expect(parseItems(JSON.stringify({ not: "array" }))).toEqual([]);
  });
});
