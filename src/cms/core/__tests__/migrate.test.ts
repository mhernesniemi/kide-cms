import { describe, expect, it } from "vitest";

import { defineCollection, defineConfig, fields } from "../define";
import { describeModel, FIELD_MODEL } from "../field-model";
import { importDocuments, validateDocument } from "../migrate";

const posts = defineCollection({
  slug: "posts",
  labels: { singular: "Post", plural: "Posts" },
  drafts: true,
  fields: {
    title: fields.text({ required: true }),
    status: fields.select({ options: ["draft", "live"] }),
    image: fields.image(),
    related: fields.relation({ collection: "posts", hasMany: true }),
    body: fields.content({ blocks: { quote: { text: fields.text() } } }),
  },
});
const config = defineConfig({ collections: [posts] });

describe("validateDocument", () => {
  it("flags a missing required field", () => {
    const r = validateDocument(posts, {});
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.field === "title")).toBe(true);
  });

  it("passes a valid document", () => {
    expect(validateDocument(posts, { title: "Hi" }).ok).toBe(true);
  });

  it("rejects an out-of-range select value", () => {
    expect(validateDocument(posts, { title: "Hi", status: "nope" }).ok).toBe(false);
  });

  it("requires an array for a hasMany relation", () => {
    expect(validateDocument(posts, { title: "Hi", related: "x" }).ok).toBe(false);
    expect(validateDocument(posts, { title: "Hi", related: ["x"] }).ok).toBe(true);
  });

  it("warns about an undeclared inline block type", () => {
    const r = validateDocument(posts, {
      title: "Hi",
      body: { type: "root", children: [{ type: "block", blockType: "unknown", fields: {} }] },
    });
    expect(r.ok).toBe(true);
    expect(r.warnings.some((w) => w.message.includes("unknown"))).toBe(true);
  });

  it("errors when content is not a root document", () => {
    expect(validateDocument(posts, { title: "Hi", body: "plain" }).ok).toBe(false);
  });
});

describe("describeModel", () => {
  it("describes collections, controls and block registries", () => {
    const model = describeModel(config);
    const post = model.collections[0];
    expect(post.slug).toBe("posts");
    expect((post.fields.title as { control: string }).control).toBe(FIELD_MODEL.text.control);
    expect((post.fields.body as { blockTypes: object }).blockTypes).toHaveProperty("quote");
  });
});

describe("importDocuments dry-run", () => {
  it("reports invalid documents without writing", async () => {
    const report = await importDocuments({} as never, config, [{ collection: "posts", data: {} }], { dryRun: true });
    expect(report.dryRun).toBe(true);
    expect(report.failed).toBe(1);
    expect(report.created).toBe(0);
    expect(report.invalid[0].errors.length).toBeGreaterThan(0);
  });
});
