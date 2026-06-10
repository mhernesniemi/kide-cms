import { describe, expect, it } from "vitest";

import {
  defineCollection,
  defineConfig,
  fields,
  getCollectionLabel,
  getCollectionMap,
  getDefaultLocale,
  getLabelField,
  getTranslatableFieldNames,
  hasRole,
  isStructuralField,
} from "../define";

const makeCollection = (overrides: Partial<Parameters<typeof defineCollection>[0]> = {}) =>
  defineCollection({
    slug: "things",
    labels: { singular: "Thing", plural: "Things" },
    fields: { name: fields.text({ required: true }) },
    ...overrides,
  });

describe("fields factory", () => {
  it("attaches the type discriminator", () => {
    expect(fields.text().type).toBe("text");
    expect(fields.richText().type).toBe("richText");
    expect(fields.relation({ collection: "authors" }).collection).toBe("authors");
  });

  it("defaults slugs to unique, with explicit opt-out", () => {
    expect(fields.slug().unique).toBe(true);
    expect(fields.slug({ unique: false }).unique).toBe(false);
  });
});

describe("getCollectionMap / getDefaultLocale", () => {
  it("maps collections by slug", () => {
    const config = defineConfig({ collections: [makeCollection(), makeCollection({ slug: "others" })] });
    const map = getCollectionMap(config);
    expect(Object.keys(map)).toEqual(["things", "others"]);
    expect(map.things.slug).toBe("things");
  });

  it("returns the default locale or null", () => {
    expect(getDefaultLocale(defineConfig({ collections: [] }))).toBeNull();
    expect(getDefaultLocale(defineConfig({ locales: { default: "fi", supported: ["fi"] }, collections: [] }))).toBe(
      "fi",
    );
  });
});

describe("getTranslatableFieldNames", () => {
  it("returns only fields marked translatable", () => {
    const collection = makeCollection({
      fields: {
        title: fields.text({ translatable: true }),
        internal: fields.text(),
        body: fields.richText({ translatable: true }),
      },
    });
    expect(getTranslatableFieldNames(collection)).toEqual(["title", "body"]);
  });
});

describe("isStructuralField", () => {
  it("classifies non-text-content fields as structural", () => {
    expect(isStructuralField(fields.number())).toBe(true);
    expect(isStructuralField(fields.boolean())).toBe(true);
    expect(isStructuralField(fields.image())).toBe(true);
    expect(isStructuralField(fields.text())).toBe(false);
    expect(isStructuralField(fields.richText())).toBe(false);
  });
});

describe("getLabelField", () => {
  it("prefers explicit labelField when it exists", () => {
    const collection = makeCollection({
      labelField: "heading",
      fields: { heading: fields.text(), title: fields.text() },
    });
    expect(getLabelField(collection)).toBe("heading");
  });

  it("ignores labelField pointing to a missing field", () => {
    const collection = makeCollection({
      labelField: "ghost",
      fields: { title: fields.text() },
    });
    expect(getLabelField(collection)).toBe("title");
  });

  it("falls back title → name → first text field → first field", () => {
    expect(getLabelField(makeCollection({ fields: { name: fields.text() } }))).toBe("name");
    expect(getLabelField(makeCollection({ fields: { count: fields.number(), caption: fields.text() } }))).toBe(
      "caption",
    );
    expect(getLabelField(makeCollection({ fields: { count: fields.number() } }))).toBe("count");
  });
});

describe("getCollectionLabel", () => {
  it("returns the plural label", () => {
    expect(getCollectionLabel(makeCollection())).toBe("Things");
  });
});

describe("hasRole", () => {
  it("matches any of the given roles", async () => {
    const rule = hasRole("admin", "editor");
    expect(await rule({ user: { id: "1", role: "admin" }, operation: "read", collection: "x" })).toBe(true);
    expect(await rule({ user: { id: "1", role: "viewer" }, operation: "read", collection: "x" })).toBe(false);
    expect(await rule({ user: null, operation: "read", collection: "x" })).toBe(false);
  });
});
