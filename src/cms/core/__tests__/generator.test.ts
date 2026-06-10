import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { defineCollection, defineConfig, fields } from "../define";
import { generate } from "../generator";

// A fixture covering the field-type matrix: required, unique, defaults, translatable,
// drafts/versions, relations (single + hasMany), blocks, and camelCase → snake_case mapping.
const articles = defineCollection({
  slug: "articles",
  labels: { singular: "Article", plural: "Articles" },
  drafts: true,
  versions: { max: 5 },
  fields: {
    title: fields.text({ required: true, translatable: true }),
    slug: fields.slug({ from: "title" }),
    readingTime: fields.number({ defaultValue: 5 }),
    featured: fields.boolean({ defaultValue: false }),
    publishDate: fields.date(),
    tone: fields.select({ options: ["formal", "casual"] }),
    body: fields.richText({ translatable: true }),
    cover: fields.image(),
    author: fields.relation({ collection: "writers" }),
    related: fields.relation({ collection: "articles", hasMany: true }),
    tags: fields.array({ of: fields.text() }),
    meta: fields.json(),
    sections: fields.blocks({
      types: {
        hero: { heading: fields.text({ required: true }), image: fields.image() },
        quote: { text: fields.text(), attribution: fields.text() },
      },
    }),
  },
});

const writers = defineCollection({
  slug: "writers",
  labels: { singular: "Writer", plural: "Writers" },
  timestamps: false,
  fields: {
    name: fields.text({ required: true }),
    contactEmail: fields.email({ unique: true }),
  },
});

const config = defineConfig({
  locales: { default: "en", supported: ["en", "fi"] },
  collections: [articles, writers],
});

describe("generate", () => {
  let outputDir: string;
  let schema: string;
  let types: string;
  let validators: string;
  let api: string;

  beforeAll(async () => {
    outputDir = mkdtempSync(path.join(tmpdir(), "kide-generator-test-"));
    await generate(config, { outputDir });
    schema = readFileSync(path.join(outputDir, "schema.ts"), "utf-8");
    types = readFileSync(path.join(outputDir, "types.ts"), "utf-8");
    validators = readFileSync(path.join(outputDir, "validators.ts"), "utf-8");
    api = readFileSync(path.join(outputDir, "api.ts"), "utf-8");
  });

  afterAll(() => {
    rmSync(outputDir, { recursive: true, force: true });
  });

  describe("schema.ts", () => {
    it("maps camelCase fields to snake_case columns", () => {
      expect(schema).toContain('readingTime: integer("reading_time")');
      expect(schema).toContain('contactEmail: text("contact_email")');
    });

    it("marks required fields notNull and unique fields unique", () => {
      expect(schema).toMatch(/title: text\("title"\)\.notNull\(\)/);
      expect(schema).toMatch(/contactEmail: text\("contact_email"\)\.unique\(\)/);
      // slug defaults to unique
      expect(schema).toMatch(/slug: text\("slug"\)\.unique\(\)/);
    });

    it("applies scalar defaults", () => {
      expect(schema).toContain(".default(5)");
      expect(schema).toContain(".default(false)");
    });

    it("adds draft columns only for draft-enabled collections", () => {
      expect(schema).toContain("cmsArticles");
      expect(schema).toMatch(/cms_articles[\s\S]*?_status/);
      // writers has no drafts and no timestamps
      const writersTable = schema.slice(schema.indexOf("cmsWriters"));
      expect(writersTable.split("export")[0]).not.toContain("_status");
      expect(writersTable.split("export")[0]).not.toContain("_created_at");
    });

    it("creates a translations table only when translatable fields exist", () => {
      expect(schema).toContain("cms_articles_translations");
      expect(schema).not.toContain("cms_writers_translations");
    });

    it("creates a versions table only for versioned collections", () => {
      expect(schema).toContain("cms_articles_versions");
      expect(schema).not.toContain("cms_writers_versions");
    });

    it("matches the golden snapshot", () => {
      expect(schema).toMatchSnapshot();
    });
  });

  describe("types.ts", () => {
    it("emits document and input types per collection", () => {
      expect(types).toContain("ArticlesDocument");
      expect(types).toContain("ArticlesInput");
      expect(types).toContain("WritersDocument");
    });

    it("matches the golden snapshot", () => {
      expect(types).toMatchSnapshot();
    });
  });

  describe("validators.ts", () => {
    it("emits zod validators per collection", () => {
      expect(validators).toContain("zod");
      expect(validators).toContain("articles");
    });

    it("matches the golden snapshot", () => {
      expect(validators).toMatchSnapshot();
    });
  });

  describe("api.ts", () => {
    it("wires createCms with typed collection APIs", () => {
      expect(api).toContain("createCms(config)");
      expect(api).toContain("articles:");
      expect(api).toContain("writers:");
    });

    it("matches the golden snapshot", () => {
      expect(api).toMatchSnapshot();
    });
  });
});
