import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { defineCollection, defineConfig, fields } from "../../define";
import { validateDocument } from "../../migrate";
import { blockHtml, nestAcf, parseBlocks } from "../gutenberg";
import { defineMapping, skipSource, type Mapping } from "../mapping";
import { readMysqlDump } from "../mysql-dump";
import { maybeUnserialize } from "../php";
import { termParts } from "../terms";
import { textRecall } from "../domain";
import { MEDIA_TOKEN, normalizePath, planImport, tokenKey, type PlanResult } from "../plan";
import { openStaging, type Staging } from "../staging";
import { scoutWordPress } from "../wordpress";

const dump = path.join(import.meta.dirname, "fixtures", "wp.sql.gz");

const posts = defineCollection({
  slug: "posts",
  labels: { singular: "Post", plural: "Posts" },
  drafts: true,
  fields: {
    title: fields.text({ required: true }),
    slug: fields.slug({ unique: false }),
    subtitle: fields.text(),
    excerpt: fields.text(),
    publishedAt: fields.date(),
    image: fields.image(),
    category: fields.text(),
    related: fields.relation({ collection: "pages", hasMany: true }),
    facts: fields.json({
      admin: { component: "repeater" },
      itemFields: { label: fields.text(), value: fields.text() },
    }),
    body: fields.content({ blocks: { hero: { heading: fields.text(), items: fields.json() } } }),
  },
});
const pages = defineCollection({
  slug: "pages",
  labels: { singular: "Page", plural: "Pages" },
  drafts: true,
  fields: {
    title: fields.text({ required: true, translatable: true }),
    slug: fields.slug({ unique: false, translatable: true }),
    body: fields.content({ translatable: true }),
  },
});
const config = defineConfig({ collections: [posts, pages], locales: { default: "en", supported: ["en", "fi"] } });

const postMapping = defineMapping({
  source: "post",
  collection: "posts",
  map: (src, ctx) => ({
    title: src.title,
    slug: src.slug,
    subtitle: src.meta.subtitle,
    excerpt: src.excerpt,
    publishedAt: ctx.date(src.date),
    image: ctx.media(src.featuredImage),
    category: src.terms.category?.[0]?.slug,
    related: ctx.refs(src.meta.related),
    facts: (src.meta.facts ?? []).map((f: any) => ({ label: f.label, value: f.value })),
    body: ctx.content(src.content),
  }),
  blocks: {
    "acf/hero": (b) => ({
      type: "block",
      blockType: "hero",
      fields: { heading: b.data.heading, items: b.data.items.map((i: any) => i.label) },
    }),
  },
  drop: {
    author: "personal data",
    "meta._yoast_*": "SEO handled separately",
    "meta.legacy_flag": "unused",
    "block:acf/hero.data.bg_color": "theme colour",
  },
});
const pageMapping = defineMapping({
  source: "page",
  collection: "pages",
  map: (src, ctx) => ({ title: src.title, slug: src.slug, body: ctx.content(src.content) }),
  drop: { author: "personal data", date: "pages show no date" },
});
const complete = [
  postMapping,
  pageMapping,
  skipSource("term:category", "category slug stored on posts"),
  skipSource("taxonomy", "covered in the taxonomy tests"),
  skipSource("redirect", "covered in the redirect tests"),
];

let dir: string;
let staging: Staging;
const plan = (mappings: Mapping[] | Array<Mapping | ReturnType<typeof skipSource>>, minRecall?: number) =>
  planImport(staging, config, mappings, { minRecall });
const ledger = (p: PlanResult, source: string) => p.ledgers.find((l) => l.source === source)!;
const unaccounted = (p: PlanResult, source: string) =>
  ledger(p, source)
    .paths.filter((x) => x.status === "unaccounted")
    .map((x) => x.path);

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "kide-import-"));
  staging = openStaging(dir);
  await scoutWordPress(staging, dump);
});
afterAll(() => {
  staging.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("source readers", () => {
  it("unserializes PHP arrays with multibyte strings", () => {
    expect(maybeUnserialize('a:2:{s:2:"en";i:10;s:2:"fi";s:3:"äb";}')).toEqual({ en: 10, fi: "äb" });
    expect(maybeUnserialize('a:1:{i:0;s:2:"10";}')).toEqual(["10"]);
    expect(maybeUnserialize("plain text")).toBe("plain text");
  });

  it("nests ACF repeaters and flexible content", () => {
    expect(
      nestAcf({
        rows: "2",
        _rows: "field_r",
        rows_0_title: "A",
        rows_1_title: "B",
        rows_1_links: "1",
        rows_1_links_0_url: "/x",
        flex: ["text", "image"],
        flex_0_body: "Hi",
        flex_1_img: "30",
        plain: "keep",
      }),
    ).toEqual({
      rows: [{ title: "A" }, { title: "B", links: [{ url: "/x" }] }],
      flex: [
        { body: "Hi", acf_fc_layout: "text" },
        { img: "30", acf_fc_layout: "image" },
      ],
      plain: "keep",
    });
  });

  it("parses nested Gutenberg blocks and keeps inner HTML positions", () => {
    const [list] = parseBlocks(
      "<!-- wp:list --><ul><!-- wp:list-item --><li>One</li><!-- /wp:list-item --><!-- wp:list-item --><li>Two</li><!-- /wp:list-item --></ul><!-- /wp:list -->",
    );
    expect(list.innerBlocks.map((b) => b.name)).toEqual(["core/list-item", "core/list-item"]);
    expect(blockHtml(list)).toBe("<ul><li>One</li><li>Two</li></ul>");
    expect(parseBlocks("Classic text")[0].name).toBe("core/freeform");
  });

  it("streams a gzipped mysqldump with escapes and multi-line inserts", async () => {
    const tables = new Map<string, number>();
    let title = "";
    for await (const batch of readMysqlDump(dump, () => true)) {
      tables.set(batch.table, (tables.get(batch.table) ?? 0) + batch.rows.length);
      if (batch.table === "wp_posts") title = String(batch.rows.find((r) => r[0] === 20)![5]);
    }
    expect(tables.get("wp_posts")).toBe(7);
    expect(tables.get("wp_postmeta")).toBe(15);
    expect(title).toBe('Hello "world"');
  });
});

describe("scout", () => {
  it("stages clean records: no revisions, attachments as media, locales and groups resolved", () => {
    const rows = staging.prepare("SELECT key, type FROM records ORDER BY key").all() as Array<{
      key: string;
      type: string;
    }>;
    expect(rows.map((r) => r.key)).toEqual([
      "post:10",
      "post:11",
      "post:20",
      "post:22",
      "post:40",
      "redirect:1",
      "taxonomy:category",
      "term:5",
    ]);
    const post = JSON.parse((staging.prepare("SELECT data FROM records WHERE key='post:20'").get() as any).data);
    expect(post.featuredImage).toBe(30);
    expect(post.meta._edit_lock).toBeUndefined();
    expect(post.meta.facts).toEqual([
      { label: "Founded long ago", value: "1999" },
      { label: "People working here", value: "120" },
    ]);
    const fi = JSON.parse((staging.prepare("SELECT data FROM records WHERE key='post:11'").get() as any).data);
    expect(fi.locale).toBe("fi");
    expect(fi.group).toMatch(/^pll:/);
    expect(staging.prepare("SELECT file, alt FROM media WHERE key='att:30'").get()).toEqual({
      file: "2023/05/team.jpg",
      alt: "Team photo",
    });
  });
});

describe("plan", () => {
  it("blocks on unmapped types and lists every unread path with a sample", async () => {
    const p = await plan([
      defineMapping({ source: "post", collection: "posts", map: (src) => ({ title: src.title }) }),
    ]);
    expect(p.blocking.some((b) => b.includes("`page`"))).toBe(true);
    const open = unaccounted(p, "post");
    expect(open).toEqual(
      expect.arrayContaining([
        "content",
        "meta.subtitle",
        "meta.facts[].label",
        "featuredImage",
        "block:acf/hero",
        "block:acf/hero.data.items[].label",
        "shortcode:caption",
      ]),
    );
    expect(open).not.toContain("title");
  });

  it("is ready when everything is mapped or dropped", async () => {
    const p = await plan(complete);
    expect(ledger(p, "post").issues.filter((i) => !["warning", "url-change"].includes(i.kind))).toEqual([]);
    expect(p.blocking).toEqual([]);
    expect(ledger(p, "post").recall.min).toBe(1);
    expect(ledger(p, "page").recall.min).toBe(1);
  });

  it("renders blocks, expands reusable blocks, resolves media and internal links", async () => {
    const p = await plan(complete);
    const doc = p.docs.find((d) => d.docId === "wp-20")!;
    const json = JSON.stringify(doc.data);
    const mediaKeys = [...json.matchAll(MEDIA_TOKEN)].map((m) => tokenKey(m[1]));
    expect(mediaKeys).toContain("att:30");
    expect(mediaKeys).toContain("file:2023/05/brochure.pdf");
    expect(json).toContain('"href":"/services/"');
    expect(json).toContain("Reusable call to action text.");
    expect(json).toContain("Caption text for the photo");
    expect(json).not.toContain("[caption");
    const body = doc.data.body as { children: Array<Record<string, any>> };
    expect(body.children.find((n) => n.type === "block")).toMatchObject({
      blockType: "hero",
      fields: {
        heading: "Build better öppen services",
        items: ["Fast delivery for teams", "Calm operations at scale"],
      },
    });
    expect(doc.data.related).toEqual(["wp-10"]);
    expect(doc.data._status).toBe("published");
    expect(p.docs.find((d) => d.docId === "wp-22")!.data._status).toBe("draft");
  });

  it("collapses a translation group into one document with an overlay", async () => {
    const p = await plan(complete);
    const about = p.docs.find((d) => d.docId === "wp-10")!;
    expect(about.data._sourceLocale).toBe("en");
    expect(about.translations.fi.title).toBe("Meistä");
    expect(p.docs.some((d) => d.docId === "wp-11")).toBe(false);
  });

  it("reports dangling refs unless they are optional", async () => {
    const withoutPages = [postMapping, skipSource("page", "x"), skipSource("term:category", "x")];
    const p = await plan(withoutPages);
    expect(ledger(p, "post").issues.some((i) => i.kind === "dangling-ref")).toBe(true);
    const optional = defineMapping({
      ...postMapping,
      map: (src, ctx) => ({ title: src.title, related: ctx.refs(src.meta.related, { optional: true }) }),
    });
    const ok = await plan([optional, skipSource("page", "x"), skipSource("term:category", "x")]);
    expect(ledger(ok, "post").issues.some((i) => i.kind === "dangling-ref")).toBe(false);
  });

  it("flags text the mapping reads but never writes", async () => {
    const lossy = defineMapping({
      ...postMapping,
      blocks: {
        "acf/hero": (b) => ({
          type: "block",
          blockType: "hero",
          fields: { heading: b.data.heading, items: b.data.items.map((i: any) => (i.label ? "" : "")) },
        }),
      },
    });
    const p = await plan([lossy, pageMapping, skipSource("term:category", "x")]);
    expect(ledger(p, "post").issues.some((i) => i.kind === "low-recall")).toBe(true);
  });

  it("warns when a non-translatable field differs between locales", async () => {
    const p = await plan([
      postMapping,
      defineMapping({
        ...pageMapping,
        map: (src, ctx) => ({ ...pageMapping.map(src, ctx), _internal: 1, extra: src.slug }),
      }),
      skipSource("term:category", "x"),
    ]);
    expect(ledger(p, "page").issues.some((i) => i.kind === "lost-translation" && i.message.includes('"extra"'))).toBe(
      true,
    );
  });

  it("leaves translation values equal to the original out, so they inherit", async () => {
    const p = await plan([
      postMapping,
      defineMapping({ ...pageMapping, map: (src, ctx) => ({ ...pageMapping.map(src, ctx), title: "Same" }) }),
      skipSource("term:category", "x"),
      skipSource("taxonomy", "x"),
    ]);
    const translated = p.docs.find((d) => d.collection === "pages" && Object.keys(d.translations).length)!;
    expect(translated.data.title).toBe("Same");
    expect(Object.values(translated.translations).every((overlay) => !("title" in overlay))).toBe(true);
  });

  it("hashes deterministically so unchanged re-runs write nothing", async () => {
    const [a, b] = [await plan(complete), await plan(complete)];
    expect(a.docs.map((d) => d.hash)).toEqual(b.docs.map((d) => d.hash));
  });
});

describe("Kide-native structures", () => {
  const blog = defineCollection({
    slug: "posts",
    labels: { singular: "Post", plural: "Posts" },
    pathPrefix: { en: "blog", fi: "blogi" },
    fields: {
      title: fields.text({ required: true }),
      slug: fields.slug({ unique: false }),
      categories: fields.taxonomy({ taxonomy: "categories", hasMany: true }),
    },
  });
  const site = defineCollection({
    slug: "pages",
    labels: { singular: "Page", plural: "Pages" },
    fields: {
      title: fields.text({ required: true, translatable: true }),
      slug: fields.slug({ unique: false, translatable: true }),
      cta: fields.link(),
    },
  });
  const taxonomies = defineCollection({
    slug: "taxonomies",
    labels: { singular: "Taxonomy", plural: "Taxonomies" },
    fields: {
      name: fields.text({ required: true }),
      slug: fields.slug(),
      terms: fields.json({ admin: { component: "taxonomy-terms" } }),
    },
  });
  const redirects = defineCollection({
    slug: "redirects",
    labels: { singular: "Redirect", plural: "Redirects" },
    fields: { from: fields.text({ required: true }), to: fields.text({ required: true }) },
  });
  const native = defineConfig({
    collections: [blog, site, taxonomies, redirects],
    locales: { default: "en", supported: ["en", "fi"] },
  });

  const taxonomyMapping = defineMapping({
    source: "taxonomy",
    collection: "taxonomies",
    includes: ["term:category"],
    id: () => "taxonomy-categories",
    map: (_src, ctx) => ({
      name: "Categories",
      slug: "categories",
      terms: ctx.records("term:category").map((t) => ({ id: `t-${t.id}`, name: t.name, slug: t.slug, children: [] })),
    }),
  });
  const blogMapping = (category: (src: any) => string) =>
    defineMapping({
      source: "post",
      collection: "posts",
      map: (src) => ({ title: src.title, slug: src.slug, categories: [category(src)].filter(Boolean) }),
      drop: { "*": "only the fields under test" },
    });
  const pageWithCta = defineMapping({
    source: "page",
    collection: "pages",
    map: (src, ctx) => ({ title: src.title, slug: src.slug, cta: ctx.link("https://example.com/about/") }),
    drop: { "*": "only the fields under test" },
  });
  const rest = [skipSource("redirect", "not under test")];
  const run = (mappings: Array<Mapping | ReturnType<typeof skipSource>>) => planImport(staging, native, mappings);

  it("folds included records into one document and covers their paths", async () => {
    const p = await run([taxonomyMapping, blogMapping((s) => s.terms.category?.[0]?.slug), pageWithCta, ...rest]);
    expect(p.unmapped.map((u) => u.type)).not.toContain("term:category");
    expect(p.docs.find((d) => d.docId === "taxonomy-categories")!.data.terms).toEqual([
      { id: "t-5", name: "News", slug: "news", children: [] },
    ]);
    expect(ledger(p, "taxonomy").paths.find((x) => x.path === "term:category:name")?.status).toBe("mapped");
    expect(p.ledgers.flatMap((l) => l.issues).filter((i) => i.kind === "dangling-term")).toEqual([]);
  });

  it("blocks on taxonomy values that aren't terms", async () => {
    const p = await run([taxonomyMapping, blogMapping(() => "nope"), pageWithCta, ...rest]);
    expect(ledger(p, "post").issues.some((i) => i.kind === "dangling-term" && i.message.includes('"nope"'))).toBe(true);
    expect(p.blocking.some((b) => b.includes("dangling-term"))).toBe(true);
  });

  it("blocks on term names that bundle several terms", async () => {
    const bundled = defineMapping({
      ...taxonomyMapping,
      map: () => ({
        name: "Categories",
        slug: "categories",
        terms: [{ id: "t-1", name: "News|Events", slug: "news", children: [] }],
      }),
    });
    const p = await run([bundled, blogMapping(() => "news"), pageWithCta, ...rest]);
    expect(ledger(p, "taxonomy").issues.some((i) => i.kind === "bundled-term")).toBe(true);
    expect(p.blocking.some((b) => b.includes("bundled-term"))).toBe(true);
    expect(termParts("Business | Press releases;Tech")).toEqual(["Business", "Press releases", "Tech"]);
  });

  it("turns internal URLs into document references", async () => {
    const p = await run([taxonomyMapping, blogMapping((s) => s.terms.category?.[0]?.slug), pageWithCta, ...rest]);
    expect(p.docs.find((d) => d.docId === "wp-10")!.data.cta).toEqual({
      type: "reference",
      docId: "wp-10",
      collection: "pages",
      url: "/about",
      title: "About us",
    });
  });

  it("reports URL changes and feeds them to url-change mappings", async () => {
    const redirectsFromChanges = defineMapping({
      source: "url-change",
      collection: "redirects",
      map: (src) => ({ from: src.from, to: src.to }),
      drop: { collection: "info", docId: "info", sourceKey: "info" },
    });
    const p = await run([
      taxonomyMapping,
      blogMapping((s) => s.terms.category?.[0]?.slug),
      pageWithCta,
      redirectsFromChanges,
      ...rest,
    ]);
    expect(p.urlChanges.map((c) => [c.from, c.to])).toEqual([["/2023/05/hello-world", "/blog/hello-world"]]);
    expect(p.docs.filter((d) => d.collection === "redirects").map((d) => d.data)).toEqual([
      expect.objectContaining({ from: "/2023/05/hello-world", to: "/blog/hello-world" }),
    ]);
    expect(ledger(p, "page").issues.filter((i) => i.kind === "url-change")).toEqual([]);
  });

  it("normalizes paths the way visitors see them", () => {
    expect(normalizePath("/fi/blogit/teko%C3%A4ly/?x=1")).toBe("/fi/blogit/tekoäly");
    expect(normalizePath("/")).toBe("/");
  });

  it("declares taxonomy fields and validates their shape", () => {
    expect(blog.fields.categories).toMatchObject({
      type: "json",
      admin: { component: "taxonomy-select", taxonomy: "categories" },
    });
    expect(fields.taxonomy({ taxonomy: "tags" })).toMatchObject({ type: "text" });
    expect(validateDocument(blog, { title: "x", categories: "news" }).ok).toBe(false);
    expect(validateDocument(blog, { title: "x", categories: ["news"] }).ok).toBe(true);
  });
});

describe("textRecall", () => {
  it("counts every copy by default and each distinct word in set mode", () => {
    const expected = ["Acme Drupal", "Acme Cache"];
    expect(textRecall(expected, ["Acme", "Drupal", "Cache"]).recall).toBe(0.75);
    expect(textRecall(expected, ["Acme", "Drupal", "Cache"], "set").recall).toBe(1);
    expect(textRecall(expected, ["Acme", "Drupal"], "set").missing).toEqual(["cache"]);
  });
});
