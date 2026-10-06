/**
 * Integration tests: real generated schema + real cms.config on an in-memory SQLite DB.
 * Exercises the full createCms pipeline — coercion, validation, slugs, drafts/publish,
 * translations, versions — plus DB-backed invites. Sessions: auth-engine.test.ts.
 */
import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { pushSQLiteSchema } from "drizzle-kit/api";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as generatedSchema from "./fixtures/project/src/cms/.generated/schema";
import config from "./fixtures/config";
import { createCms } from "../api";
import { resolveLinkUrl } from "../values";
import { createInvite, consumeInvite, validateInvite } from "../auth";
import { configureCmsRuntime, resetCmsRuntime } from "../runtime";
import { initSchema, resetSchema } from "../schema";

let sqlite: InstanceType<typeof Database>;
let db: ReturnType<typeof drizzle>;
let cms: ReturnType<typeof createCms>;

beforeAll(async () => {
  sqlite = new Database(":memory:");
  db = drizzle(sqlite);

  // Create all tables from the real generated schema. drizzle-kit's apply()
  // assumes a libsql driver (calls .all() on DDL), so execute the generated
  // statements directly against better-sqlite3 instead.
  const { statementsToExecute } = await pushSQLiteSchema({ ...generatedSchema }, db as never);
  for (const statement of statementsToExecute) sqlite.exec(statement);

  initSchema(generatedSchema as never);

  const files = new Map<string, Uint8Array>();
  configureCmsRuntime({
    getDb: async () => db,
    storage: {
      putFile: async (p, data) => {
        files.set(p, data instanceof Uint8Array ? data : new Uint8Array(data));
      },
      getFile: async (p) => {
        const data = files.get(p);
        if (!data) return null;
        return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
      },
      deleteFile: async (p) => {
        files.delete(p);
      },
    },
  });

  cms = createCms(config);
});

afterAll(() => {
  resetCmsRuntime();
  resetSchema();
  sqlite.close();
});

describe("create", () => {
  it("creates a document with timestamps and an auto-generated slug", async () => {
    const author = await (cms as any).authors.create({ name: "Ada Lovelace" });
    expect(author._id).toBeTruthy();
    expect(author.slug).toBe("ada-lovelace");
    expect(author._createdAt).toBeTruthy();
    expect(author._updatedAt).toBeTruthy();
  });

  it("rejects missing required fields", async () => {
    await expect((cms as any).authors.create({ title: "No name" })).rejects.toThrow(/required/);
  });

  it("slugifies an explicitly provided slug", async () => {
    const author = await (cms as any).authors.create({ name: "Slug Test", slug: "My Custom Slug!" });
    expect(author.slug).toBe("my-custom-slug");
  });

  it("coerces field values from form-style input", async () => {
    const post = await (cms as any).posts.create({
      title: "Coercion test",
      body: { type: "root", children: [{ type: "paragraph", children: [{ type: "text", value: "Hello body" }] }] },
    });
    // richText stored as parsed AST after round-trip
    expect(post.body.type).toBe("root");
    // beforeCreate hook derived the excerpt from the body
    expect(post.excerpt).toBe("Hello body");
  });

  it("coerces plain text into a richText AST", async () => {
    const post = await (cms as any).posts.create({ title: "Plain body", body: "Just plain text" });
    expect(post.body.type).toBe("root");
    expect(post.body.children[0].type).toBe("paragraph");
  });

  it("throws a helpful error for unknown collections", () => {
    expect(() => (cms as any).nonexistent.create({})).toThrow();
  });
});

describe("find / findOne / findById", () => {
  it("finds by field equality", async () => {
    await (cms as any).authors.create({ name: "Findable Person" });
    const found = await (cms as any).authors.findOne({ slug: "findable-person" });
    expect(found?.name).toBe("Findable Person");
  });

  it("returns null for findById misses", async () => {
    expect(await (cms as any).authors.findById("missing-id")).toBeNull();
  });

  it("respects limit and sort", async () => {
    await (cms as any).authors.create({ name: "Aaa Sort" });
    await (cms as any).authors.create({ name: "Zzz Sort" });
    const result = await (cms as any).authors.find({
      sort: { field: "name", direction: "desc" },
      limit: 1,
    });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Zzz Sort");
  });
});

describe("where operators", () => {
  const ids = (docs: Array<{ _id: string }>) => docs.map((doc) => doc._id).sort();
  let early: any, middle: any, late: any;

  beforeAll(async () => {
    early = await (cms as any).posts.create({ title: "Ops early", category: "ops", listed: true });
    middle = await (cms as any).posts.create({ title: "Ops middle", category: "ops-b", listed: false });
    late = await (cms as any).posts.create({ title: "Ops late", category: "ops", listed: true });
    const setPublishedAt = (id: string, date: string) =>
      db.update(generatedSchema.cmsPosts).set({ _publishedAt: date }).where(eq(generatedSchema.cmsPosts._id, id)).run();
    setPublishedAt(early._id, "2026-01-15T00:00:00.000Z");
    setPublishedAt(middle._id, "2026-03-10T00:00:00.000Z");
    setPublishedAt(late._id, "2026-05-01T00:00:00.000Z");
  });

  const findOps = (where: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
    (cms as any).posts.find({
      where: { title: { in: ["Ops early", "Ops middle", "Ops late"] }, ...where },
      status: "any",
      ...extra,
    });

  it("filters ranges with gte / lt, including Date values", async () => {
    const march = await findOps({ _publishedAt: { gte: "2026-03-01", lt: new Date("2026-04-01T00:00:00.000Z") } });
    expect(ids(march)).toEqual([middle._id]);
    const fromMarch = await findOps({ _publishedAt: { gt: "2026-03-01" } });
    expect(ids(fromMarch)).toEqual(ids([middle, late]));
    const upToMarch = await findOps({ _publishedAt: { lte: "2026-03-10T00:00:00.000Z" } });
    expect(ids(upToMarch)).toEqual(ids([early, middle]));
  });

  it("supports in / notIn / ne and keeps plain values as equality", async () => {
    expect(ids(await findOps({ category: { in: ["ops", "nope"] } }))).toEqual(ids([early, late]));
    expect(ids(await findOps({ category: { notIn: ["ops"] } }))).toEqual([middle._id]);
    expect(ids(await findOps({ category: { ne: "ops" } }))).toEqual([middle._id]);
    expect(ids(await findOps({ category: { in: [] } }))).toEqual([]);
    expect(ids(await findOps({ listed: true }))).toEqual(ids([early, late]));
    expect(ids(await findOps({ listed: { ne: true } }))).toEqual([middle._id]);
  });

  it("applies operators in count and deleteMany", async () => {
    expect(
      await (cms as any).posts.count({
        where: { category: { in: ["ops", "ops-b"] }, title: { ne: "Ops late" } },
        status: "any",
      }),
    ).toBe(2);
    const doomed = await (cms as any).posts.create({ title: "Ops doomed", category: "ops-del" });
    await (cms as any).posts.create({ title: "Ops kept", category: "ops-keep" });
    expect(await (cms as any).posts.deleteMany({ category: { in: ["ops-del"] } }, { _system: true })).toBe(1);
    expect(await (cms as any).posts.findById(doomed._id, { status: "any" })).toBeNull();
  });

  it("matches hasMany relations with contains / in / notIn", async () => {
    const a = await (cms as any).pages.create({ title: "Rel A", relatedPosts: [early._id, middle._id] });
    const b = await (cms as any).pages.create({ title: "Rel B", relatedPosts: [late._id] });
    await (cms as any).pages.create({ title: "Rel C" });
    const findRel = (relatedPosts: unknown) =>
      (cms as any).pages.find({ where: { title: { in: ["Rel A", "Rel B", "Rel C"] }, relatedPosts }, status: "any" });

    expect(ids(await findRel({ contains: middle._id }))).toEqual([a._id]);
    expect(ids(await findRel({ in: [early._id, late._id] }))).toEqual(ids([a, b]));
    expect((await findRel({ notIn: [early._id] })).map((page: any) => page.title).sort()).toEqual(["Rel B", "Rel C"]);
  });

  it("matches translated values for translatable fields under a locale", async () => {
    const post = await (cms as any).posts.create({ title: "Ops translated", category: "ops-tr", slug: "ops-tr-en" });
    await (cms as any).posts.upsertTranslation(post._id, "fi", { title: "Ops käännetty", slug: "ops-tr-fi" });
    const where = { category: "ops-tr", title: { in: ["Ops käännetty"] } };
    expect(ids(await (cms as any).posts.find({ where, locale: "fi", status: "any" }))).toEqual([post._id]);
    expect(await (cms as any).posts.find({ where, locale: "en", status: "any" })).toEqual([]);
  });

  it("rejects unknown and mismatched operators", async () => {
    await expect(findOps({ category: { like: "ops" } })).rejects.toThrow(/Unknown where operator/);
    await expect(findOps({ category: { contains: "ops" } })).rejects.toThrow(/isn't supported/);
    await expect(findOps({ category: { in: "ops" } })).rejects.toThrow(/expects an array/);
    await expect((cms as any).pages.find({ where: { relatedPosts: { gt: "x" } }, status: "any" })).rejects.toThrow(
      /isn't supported/,
    );
    await expect((cms as any).posts.find({ where: { body: { ne: null } }, status: "any" })).rejects.toThrow(
      /doesn't support where operators/,
    );
  });

  it("throws on empty operator objects instead of widening the filter", async () => {
    await (cms as any).posts.create({ title: "Ops survivor", category: "ops-survivor" });
    await expect(findOps({ category: {} })).rejects.toThrow(/Empty where operator/);
    await expect((cms as any).posts.deleteMany({ category: { in: undefined } }, { _system: true })).rejects.toThrow(
      /Empty where operator/,
    );
    expect(await (cms as any).posts.findOne({ category: "ops-survivor", status: "any" })).not.toBeNull();
  });

  it("rejects null inside in / notIn", async () => {
    await expect(findOps({ category: { notIn: [null, "ops"] } })).rejects.toThrow(/can't list null/);
  });

  it("allows operators on public system columns only, unless _system", async () => {
    const editor = { user: { id: "u-editor", role: "editor" } };
    await expect((cms as any).posts.find({ where: { _published: { gt: "" } }, status: "any" }, editor)).rejects.toThrow(
      /Cannot filter/,
    );
    await expect(
      (cms as any).posts.find({ where: { _status: { in: ["draft"] } }, status: "any" }, editor),
    ).resolves.toBeInstanceOf(Array);
  });

  it("refuses operators on read-restricted fields unless _system", async () => {
    const editor = { user: { id: "u-editor", role: "editor" } };
    await expect((cms as any).pages.find({ where: { summary: { gt: "a" } }, status: "any" }, editor)).rejects.toThrow(
      /Cannot filter/,
    );
    await expect(
      (cms as any).pages.find({ where: { summary: { gt: "a" } }, status: "any" }, { _system: true }),
    ).resolves.toBeInstanceOf(Array);
  });
});

describe("update / delete", () => {
  it("updates fields and bumps _updatedAt", async () => {
    const author = await (cms as any).authors.create({ name: "Update Me" });
    const updated = await (cms as any).authors.update(author._id, { title: "Editor-in-chief" });
    expect(updated.title).toBe("Editor-in-chief");
    expect(updated.name).toBe("Update Me");
  });

  it("enforces required fields on update", async () => {
    const author = await (cms as any).authors.create({ name: "Keep Name" });
    // Clearing a required field must fail
    await expect((cms as any).authors.update(author._id, { name: "" })).rejects.toThrow(/required/);
  });

  it("deletes documents", async () => {
    const author = await (cms as any).authors.create({ name: "Delete Me" });
    await (cms as any).authors.delete(author._id);
    expect(await (cms as any).authors.findById(author._id)).toBeNull();
  });
});

describe("drafts and publishing", () => {
  it("creates drafts by default in draft-enabled collections", async () => {
    const post = await (cms as any).posts.create({ title: "Draft post" });
    expect(post._status).toBe("draft");
  });

  it("excludes drafts from published queries and includes them after publish", async () => {
    const post = await (cms as any).posts.create({ title: "Publish flow" });

    const before = await (cms as any).posts.findOne({ slug: "publish-flow", status: "published" });
    expect(before).toBeNull();

    const published = await (cms as any).posts.publish(post._id);
    expect(published._status).toBe("published");
    expect(published._publishedAt).toBeTruthy();

    const after = await (cms as any).posts.findOne({ slug: "publish-flow", status: "published" });
    expect(after?._id).toBe(post._id);
  });

  it("filters, searches, sorts and counts published reads by the published values, not pending edits", async () => {
    const post = await (cms as any).posts.create({
      title: "Pending live",
      category: "pend-live",
      listed: true,
      readingTime: 3,
    });
    await (cms as any).posts.publish(post._id);
    await (cms as any).posts.update(post._id, { title: "Pending zzdraft", category: "pend-draft", listed: false });

    const published = (where: Record<string, unknown>) => (cms as any).posts.find({ where });
    expect(await published({ category: "pend-draft" })).toEqual([]);
    expect((await published({ category: "pend-live" })).map((doc: any) => doc.title)).toEqual(["Pending live"]);
    expect(await published({ category: { in: ["pend-draft"] } })).toEqual([]);
    expect(await published({ category: { in: ["pend-live"] }, listed: true })).toHaveLength(1);
    expect(await (cms as any).posts.count({ where: { category: "pend-draft" } })).toBe(0);
    expect(await (cms as any).posts.find({ search: "zzdraft" })).toEqual([]);
    // Type coercion survives the snapshot expression: a URL-param string still matches a number.
    expect(await published({ category: "pend-live", readingTime: "3" })).toHaveLength(1);
    expect(await published({ category: "pend-live", readingTime: { gte: "3" } })).toHaveLength(1);

    // Draft-side reads still see the pending edits.
    expect(await (cms as any).posts.find({ where: { category: "pend-draft" }, status: "any" })).toHaveLength(1);

    const other = await (cms as any).posts.create({ title: "Pending mid", category: "pend-live" });
    await (cms as any).posts.publish(other._id);
    const sorted = await (cms as any).posts.find({
      where: { category: "pend-live" },
      sort: { field: "title", direction: "desc" },
    });
    expect(sorted.map((doc: any) => doc.title)).toEqual(["Pending mid", "Pending live"]);

    await (cms as any).posts.publish(post._id);
    expect(await published({ category: "pend-live" })).toHaveLength(1);
    expect((await published({ category: "pend-draft" }))[0]?.title).toBe("Pending zzdraft");
  });

  it("unpublishes back to draft", async () => {
    const post = await (cms as any).posts.create({ title: "Unpublish flow" });
    await (cms as any).posts.publish(post._id);
    const unpublished = await (cms as any).posts.unpublish(post._id);
    expect(unpublished._status).toBe("draft");
  });

  it("schedules publication", async () => {
    const post = await (cms as any).posts.create({ title: "Scheduled post" });
    const future = new Date(Date.now() + 86_400_000).toISOString();
    const scheduled = await (cms as any).posts.schedule(post._id, future);
    expect(scheduled._status).toBe("scheduled");
    expect(scheduled._publishAt).toBe(future);
  });
});

describe("translations", () => {
  it("upserts and retrieves locale overlays", async () => {
    const author = await (cms as any).authors.create({ name: "Translated", description: "English text" });
    await (cms as any).authors.upsertTranslation(author._id, "fi", { description: "Suomeksi" });

    const translations = await (cms as any).authors.getTranslations(author._id);
    expect(translations.fi?.description).toBe("Suomeksi");

    const finnish = await (cms as any).authors.findById(author._id, { locale: "fi" });
    expect(finnish?.description).toBe("Suomeksi");
    expect(finnish?.name).toBe("Translated"); // non-translatable field untouched
  });

  it("findOne matches translated values of translatable fields per locale", async () => {
    const post = await (cms as any).posts.create({ title: "Localized lookup", slug: "localized-lookup" });
    await (cms as any).posts.upsertTranslation(post._id, "fi", { title: "Lokalisoitu haku", slug: "lokalisoitu-haku" });

    // The translated slug resolves under its locale.
    const byFiSlug = await (cms as any).posts.findOne({ slug: "lokalisoitu-haku", locale: "fi", status: "any" });
    expect(byFiSlug?._id).toBe(post._id);

    // The base slug still resolves for a locale with no translation…
    const byBaseSlug = await (cms as any).posts.findOne({ slug: "localized-lookup", locale: "en", status: "any" });
    expect(byBaseSlug?._id).toBe(post._id);

    // …but not under a locale whose translation overrides the value.
    const crossLocale = await (cms as any).posts.findOne({ slug: "localized-lookup", locale: "fi", status: "any" });
    expect(crossLocale).toBeNull();
  });

  it("defaults _sourceLocale to the default locale and lists it first in _availableLocales", async () => {
    const author = await (cms as any).authors.create({ name: "Default source" });
    expect(author._sourceLocale).toBe("en");
    expect(author._availableLocales).toEqual(["en"]);
    await (cms as any).authors.upsertTranslation(author._id, "fi", { description: "Suomeksi" });
    const reread = await (cms as any).authors.findById(author._id);
    expect(reread._availableLocales).toEqual(["en", "fi"]);
  });

  it("stores single-language content in its own locale and filters by availability", async () => {
    const fiOnly = await (cms as any).authors.create({ name: "Vain suomeksi", _sourceLocale: "fi" });
    expect(fiOnly._sourceLocale).toBe("fi");
    expect(fiOnly._availableLocales).toEqual(["fi"]);

    const inEnFallback = await (cms as any).authors.find({ locale: "en" });
    expect(inEnFallback.some((d: any) => d._id === fiOnly._id)).toBe(true);
    const inEnExact = await (cms as any).authors.find({ locale: "en", availability: "exact" });
    expect(inEnExact.some((d: any) => d._id === fiOnly._id)).toBe(false);
    const inFiExact = await (cms as any).authors.find({ locale: "fi", availability: "exact" });
    expect(inFiExact.some((d: any) => d._id === fiOnly._id)).toBe(true);
    expect(await (cms as any).authors.count({ locale: "en", availability: "exact", where: { _id: fiOnly._id } })).toBe(
      0,
    );
    // "missing" is the complement: not yet in English, so it's on the translation to-do list.
    const missingEn = await (cms as any).authors.find({ locale: "en", availability: "missing" });
    expect(missingEn.some((d: any) => d._id === fiOnly._id)).toBe(true);
    expect(
      await (cms as any).authors.count({ locale: "fi", availability: "missing", where: { _id: fiOnly._id } }),
    ).toBe(0);

    // A translation makes it exist in that locale too.
    await (cms as any).authors.upsertTranslation(fiOnly._id, "en", { description: "In English" });
    const afterOverlay = await (cms as any).authors.find({ locale: "en", availability: "exact" });
    expect(afterOverlay.some((d: any) => d._id === fiOnly._id)).toBe(true);
    const stillMissing = await (cms as any).authors.find({ locale: "en", availability: "missing" });
    expect(stillMissing.some((d: any) => d._id === fiOnly._id)).toBe(false);
    expect((await (cms as any).authors.findById(fiOnly._id))._availableLocales).toEqual(["fi", "en"]);
  });

  it("refuses a translation in the content language and an unsupported source locale", async () => {
    const author = await (cms as any).authors.create({ name: "Guarded", _sourceLocale: "fi" });
    await expect((cms as any).authors.upsertTranslation(author._id, "fi", { description: "x" })).rejects.toThrow(
      /content language/,
    );
    await expect((cms as any).authors.create({ name: "Nope", _sourceLocale: "sv" })).rejects.toThrow(
      /locales.supported/,
    );
  });

  it("changes the content language only when no translation holds that locale", async () => {
    const author = await (cms as any).authors.create({ name: "Switch", _sourceLocale: "en" });
    await (cms as any).authors.upsertTranslation(author._id, "fi", { description: "Suomeksi" });
    await expect((cms as any).authors.update(author._id, { _sourceLocale: "fi" })).rejects.toThrow(
      /Delete the "fi" translation/,
    );
    const moved = await (cms as any).authors.update(author._id, { _sourceLocale: "en" });
    expect(moved._sourceLocale).toBe("en");
  });

  it("filters on a translatable boolean field under a locale", async () => {
    const post = await (cms as any).posts.create({ title: "Boolean filter", slug: "boolean-filter", listed: true });

    // The locale-aware where uses raw SQL for translatable fields — booleans must bind as 0/1.
    const listed = await (cms as any).posts.find({ where: { listed: true }, locale: "fi", status: "any" });
    expect(listed.some((d: any) => d._id === post._id)).toBe(true);

    // A flag-only overlay (no other fields) both writes and filters per locale.
    await (cms as any).posts.upsertTranslation(post._id, "fi", { listed: false });
    const afterOverlay = await (cms as any).posts.find({ where: { listed: true }, locale: "fi", status: "any" });
    expect(afterOverlay.some((d: any) => d._id === post._id)).toBe(false);
    const stillListedInBase = await (cms as any).posts.find({ where: { listed: true }, locale: "en", status: "any" });
    expect(stillListedInBase.some((d: any) => d._id === post._id)).toBe(true);
  });
});

describe("resolveLinkUrl", () => {
  it("resolves the current route from the stored document reference, surviving slug edits", async () => {
    const post = await (cms as any).posts.create({ title: "Linked doc", slug: "linked-doc" });
    await (cms as any).posts.publish(post._id);
    const link = { url: "/blog/stale-cached-path", docId: post._id, collection: "posts" };
    expect(await resolveLinkUrl(cms as any, link)).toBe("/blog/linked-doc");

    await (cms as any).posts.update(post._id, { slug: "renamed-doc" });
    await (cms as any).posts.publish(post._id);
    expect(await resolveLinkUrl(cms as any, link)).toBe("/blog/renamed-doc");
  });

  it("falls back to the cached url when there is no live reference", async () => {
    expect(await resolveLinkUrl(cms as any, { url: "https://example.com" })).toBe("https://example.com");
    expect(await resolveLinkUrl(cms as any, { url: "/blog/cached", docId: "gone", collection: "posts" })).toBe(
      "/blog/cached",
    );
    expect(await resolveLinkUrl(cms as any, { url: "javascript:alert(1)" })).toBe(null);
    expect(await resolveLinkUrl(cms as any, null)).toBe(null);
  });
});

describe("versions", () => {
  it("records version snapshots on update", async () => {
    const post = await (cms as any).posts.create({ title: "Versioned post" });
    await (cms as any).posts.update(post._id, { title: "Versioned post v2" });
    const versions = await (cms as any).posts.versions(post._id);
    expect(Array.isArray(versions)).toBe(true);
    expect(versions.length).toBeGreaterThanOrEqual(1);
  });
});

describe("invites", () => {
  it("validates an unused invite and rejects it after consumption", async () => {
    const { token } = await createInvite("user-3");
    expect((await validateInvite(token))?.userId).toBe("user-3");

    await consumeInvite(token);
    expect(await validateInvite(token)).toBeNull();
  });
});

// Runs last: the full-collection wipe clears authors/posts created above.
describe("deleteMany", () => {
  it("bulk-deletes documents matching a filter, leaving others", async () => {
    await (cms as any).posts.create({ title: "Bulk A", category: "bulk-del" });
    await (cms as any).posts.create({ title: "Bulk B", category: "bulk-del" });
    await (cms as any).posts.create({ title: "Keep C", category: "keep-me" });

    const removed = await (cms as any).posts.deleteMany({ category: "bulk-del" }, { _system: true });
    expect(removed).toBe(2);

    expect(await (cms as any).posts.find({ where: { category: "bulk-del" }, status: "any" })).toHaveLength(0);
    expect(
      (await (cms as any).posts.find({ where: { category: "keep-me" }, status: "any" })).length,
    ).toBeGreaterThanOrEqual(1);
  });

  it("returns 0 when nothing matches", async () => {
    expect(await (cms as any).posts.deleteMany({ category: "no-such-category" }, { _system: true })).toBe(0);
  });

  it("clears an entire collection (and its translations) when no filter is given", async () => {
    await (cms as any).authors.create({ name: "Wipe One" });
    await (cms as any).authors.create({ name: "Wipe Two" });
    const before = await (cms as any).authors.find();
    expect(before.length).toBeGreaterThanOrEqual(2);

    const removed = await (cms as any).authors.deleteMany({}, { _system: true });
    expect(removed).toBe(before.length);
    expect(await (cms as any).authors.find()).toHaveLength(0);
  });
});

describe("createCms config guard", () => {
  it("diagnoses a partially-evaluated config (module cycle) instead of crashing cryptically", () => {
    expect(() => createCms(undefined as never)).toThrow(/module cycle/);
    expect(() => createCms({} as never)).toThrow(/module cycle/);
  });
});
