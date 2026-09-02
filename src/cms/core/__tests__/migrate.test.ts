import { describe, expect, it } from "vitest";

import { defineCollection, defineConfig, fields } from "../define";
import { describeModel, FIELD_MODEL } from "../field-model";
import { importDocuments, validateDocument, validateTranslations } from "../migrate";

const posts = defineCollection({
  slug: "posts",
  labels: { singular: "Post", plural: "Posts" },
  drafts: true,
  fields: {
    title: fields.text({ required: true }),
    status: fields.select({ options: ["draft", "live"] }),
    image: fields.image(),
    related: fields.relation({ collection: "posts", hasMany: true }),
    body: fields.content({ blocks: { quote: { text: fields.text(), tone: fields.select({ options: ["calm"] }) } } }),
    logos: fields.json({ admin: { component: "repeater" }, itemFields: { image: fields.image(), alt: fields.text() } }),
    sections: fields.blocks({ types: { hero: { heading: fields.text() } } }),
    terms: fields.json({ admin: { component: "taxonomy-terms" } }),
  },
});
const config = defineConfig({ collections: [posts] });

const offices = defineCollection({
  slug: "offices",
  labels: { singular: "Office", plural: "Offices" },
  fields: { name: fields.text({ translatable: true }), city: fields.text() },
});
const i18nConfig = defineConfig({
  collections: [offices, posts],
  locales: { default: "en", supported: ["en", "fi"] },
});

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

  it("warns when an inline block's fields don't match its declared shape", () => {
    const r = validateDocument(posts, {
      title: "Hi",
      body: {
        type: "root",
        children: [{ type: "block", blockType: "quote", fields: { quoteText: "…", tone: "loud" } }],
      },
    });
    expect(r.ok).toBe(true);
    expect(r.warnings.map((w) => w.field)).toEqual(["body[0]<quote>.tone", "body[0]<quote>.quoteText"]);
  });

  it("warns about undeclared repeater row keys but keeps them valid", () => {
    const r = validateDocument(posts, { title: "Hi", logos: [{ image: "/uploads/a.png", alt: "A", wpImageId: 4 }] });
    expect(r.ok).toBe(true);
    expect(r.warnings).toEqual([{ field: "logos[0].wpImageId", message: "not a declared field" }]);
  });

  it("warns about tree items missing what the editor needs", () => {
    const r = validateDocument(posts, {
      title: "Hi",
      terms: [
        { id: "a", name: "A", slug: "a" },
        { id: "b", name: "B", slug: "b", children: [{ name: "C" }] },
      ],
    });
    expect(r.ok).toBe(true);
    expect(r.warnings.map((w) => w.field)).toEqual([
      "terms[0].children",
      "terms[1].children[0].id",
      "terms[1].children[0].slug",
      "terms[1].children[0].children",
    ]);
    expect(validateDocument(posts, { title: "Hi", terms: "nope" }).ok).toBe(false);
  });

  it("warns about standalone block types and fields", () => {
    const r = validateDocument(posts, { title: "Hi", sections: [{ type: "hero", title: "x" }, { type: "nope" }] });
    expect(r.ok).toBe(true);
    expect(r.warnings.map((w) => w.field)).toEqual(["sections[0]<hero>.title", "sections[1]"]);
  });
});

describe("validateTranslations", () => {
  it("passes with no translations", () => {
    expect(validateTranslations(config, posts, undefined).ok).toBe(true);
  });

  it("errors when the collection has no translatable fields", () => {
    const r = validateTranslations(i18nConfig, posts, { fi: { title: "Hei" } });
    expect(r.ok).toBe(false);
    expect(r.errors[0].message).toContain("translatable: true");
  });

  it("errors when no locales are configured", () => {
    expect(validateTranslations(config, offices, { fi: { name: "Hei" } }).errors[0].message).toContain("locales");
  });

  it("rejects the default and unsupported locales", () => {
    const r = validateTranslations(i18nConfig, offices, { en: { name: "x" }, sv: { name: "y" } });
    expect(r.errors.map((e) => e.field)).toEqual(["translations.en", "translations.sv"]);
  });

  it("treats the item's _sourceLocale as the base and the default locale as a translation", () => {
    const fiBase = validateTranslations(i18nConfig, offices, { en: { name: "Office" } }, "fi");
    expect(fiBase.ok).toBe(true);
    const dup = validateTranslations(i18nConfig, offices, { fi: { name: "Toimisto" } }, "fi");
    expect(dup.errors[0].message).toContain("content language");
  });

  it("validates _sourceLocale against locales.supported", () => {
    expect(validateDocument(offices, { name: "x", _sourceLocale: "fi" }, i18nConfig).ok).toBe(true);
    expect(validateDocument(offices, { name: "x", _sourceLocale: "sv" }, i18nConfig).ok).toBe(false);
    expect(validateDocument(offices, { name: "x", _sourceLocale: "fi" }, config).ok).toBe(false);
  });

  it("warns about fields upsertTranslation would drop, errors when it would drop all of them", () => {
    const partial = validateTranslations(i18nConfig, offices, { fi: { name: "Hei", city: "Oulu" } });
    expect(partial.ok).toBe(true);
    expect(partial.warnings).toEqual([
      { field: "translations.fi.city", message: "not a translatable field (will be dropped)" },
    ]);
    expect(validateTranslations(i18nConfig, offices, { fi: { city: "Oulu" } }).ok).toBe(false);
  });
});

describe("describeModel", () => {
  it("describes collections, controls and block registries", () => {
    const model = describeModel(config);
    const post = model.collections[0];
    expect(post.slug).toBe("posts");
    expect((post.fields.title as { control: string }).control).toBe(FIELD_MODEL.text.control);
    expect((post.fields.body as { blockTypes: object }).blockTypes).toHaveProperty("quote");
    expect((post.fields.terms as { type: string; valueShape: string }).type).toBe("taxonomy-terms");
    expect((post.fields.terms as { valueShape: string }).valueShape).toContain("children");
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

  it("fails translations before any base document is written", async () => {
    const items = [{ collection: "posts", data: { title: "Hi" }, translations: { fi: { title: "Hei" } } }];
    const dry = await importDocuments({} as never, i18nConfig, items, { dryRun: true });
    expect(dry.failed).toBe(1);
    expect(dry.invalid[0].errors[0].field).toBe("translations");

    let created = 0;
    const cms = { posts: { create: async () => ({ _id: String(++created) }) } };
    const real = await importDocuments(cms as never, i18nConfig, items, { throwOnFailed: false });
    expect(real.failed).toBe(1);
    expect(created).toBe(0);
  });
});

describe("importDocuments real run", () => {
  const failingCms = {
    posts: {
      create: async () => {
        throw new Error("NOT NULL constraint failed: cms_posts.title");
      },
    },
  };
  const items = [{ collection: "posts", data: { title: "Valid but doomed" } }];

  it("throws on write failures so a half-applied import cannot look like success", async () => {
    await expect(importDocuments(failingCms as never, config, items)).rejects.toMatchObject({
      name: "ImportFailedError",
      report: { failed: 1, total: 1 },
    });
  });

  it("returns the report instead with throwOnFailed: false", async () => {
    const report = await importDocuments(failingCms as never, config, items, { throwOnFailed: false });
    expect(report.failed).toBe(1);
    expect(report.errors[0].message).toContain("NOT NULL");
  });
});
