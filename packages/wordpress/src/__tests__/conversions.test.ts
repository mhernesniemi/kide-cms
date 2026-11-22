import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { defineCollection, defineConfig, fields, presets, standardBlocks } from "@kidecms/core";
import { nestAcf } from "../gutenberg";
import { termSlugs } from "../structures";
import { defineMapping, type Mapping } from "../mapping";
import { planImport } from "../plan";
import { openStaging, setMeta, type Staging, type StagedRecord } from "../staging";
import { scoutWordPress } from "../wordpress";

const dirs: string[] = [];
const stage = (
  records: Array<Partial<StagedRecord> & { key: string; type: string }>,
  media: Array<{ key: string; id: number; file: string }> = [],
): Staging => {
  const dir = mkdtempSync(path.join(tmpdir(), "kide-conv-"));
  dirs.push(dir);
  const staging = openStaging(dir);
  setMeta(staging, "siteUrl", "https://example.com");
  const insert = staging.prepare("INSERT INTO records (key, type, data) VALUES (?, ?, ?)");
  for (const r of records)
    insert.run(r.key, r.type, JSON.stringify({ id: Number(r.key.split(":").pop()), status: "publish", ...r }));
  const addMedia = staging.prepare(
    "INSERT INTO media (key, attachment_id, file, url, mime, alt) VALUES (?, ?, ?, ?, ?, ?)",
  );
  for (const m of media)
    addMedia.run(m.key, m.id, m.file, `https://example.com/wp-content/uploads/${m.file}`, null, null);
  return staging;
};
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const collection = (slug: string, blocks = {}, extra = {}) =>
  defineCollection({
    slug,
    labels: { singular: slug, plural: slug },
    fields: { title: fields.text(), slug: fields.slug({ unique: false }), body: fields.content({ blocks }), ...extra },
  });
const pageMapping = (overrides: Partial<Mapping> = {}): Mapping =>
  defineMapping({
    source: "page",
    collection: "pages",
    map: (src, ctx) => ({ title: src.title, slug: src.slug, body: ctx.content(src.content) }),
    ...overrides,
  });
const body = (p: Awaited<ReturnType<typeof planImport>>, id = "wp-1") =>
  (p.docs.find((d) => d.docId === id)!.data.body as { children: any[] }).children;

describe("several mappings per source", () => {
  const records = [
    { key: "post:1", type: "post", title: "A", slug: "a", terms: { category: [{ slug: "news" }] } },
    { key: "post:2", type: "post", title: "B", slug: "b", terms: { category: [{ slug: "cases" }] } },
    { key: "post:3", type: "post", title: "C", slug: "c", terms: { category: [{ slug: "other" }] } },
  ];
  const config = defineConfig({ collections: [collection("news"), collection("cases")] });
  const split = (slug: string, unclaimed: boolean | string = false) =>
    defineMapping({
      source: "post",
      collection: slug,
      filter: (src) =>
        src.terms.category[0].slug === slug || (src.terms.category[0].slug === "other" ? unclaimed : false),
      map: (src) => ({ title: src.title, slug: src.slug }),
      drop: { terms: "the category is the collection" },
    });

  it("routes each record to the mapping whose filter claims it", async () => {
    const p = await planImport(stage(records), config, [split("news", "not migrated"), split("cases")]);
    expect(p.docs.map((d) => [d.collection, d.docId])).toEqual([
      ["news", "wp-1"],
      ["cases", "wp-2"],
    ]);
    expect(p.blocking).toEqual([]);
  });

  it("counts what filters read as covered", async () => {
    const p = await planImport(stage(records), config, [
      { ...split("news", "not migrated"), drop: {} },
      { ...split("cases"), drop: {} },
    ]);
    expect(p.blocking).toEqual([]);
  });

  it("gives every source its own default id and names the sources sharing one", async () => {
    const staging = stage([...records.slice(0, 2), { key: "redirect:1", type: "redirect", title: "R", slug: "r" }]);
    const redirect = defineMapping({
      source: "redirect",
      collection: "cases",
      map: (s) => ({ title: s.title, slug: s.slug }),
    });
    const p = await planImport(staging, config, [split("news", "x"), split("cases"), redirect]);
    expect(p.docs.map((d) => d.docId).sort()).toEqual(["wp-1", "wp-2", "wp-redirect-1"]);
    const clash = await planImport(staging, config, [
      split("news", "x"),
      split("cases"),
      { ...redirect, id: () => "wp-1" },
    ]);
    expect(clash.blocking.join()).toContain("duplicate-id");
    expect(clash.ledgers.flatMap((l) => l.issues).find((i) => i.kind === "duplicate-id")?.message).toContain(
      "post:1 → news",
    );
  });

  it("blocks on records no mapping claims", async () => {
    const p = await planImport(stage(records), config, [split("news"), split("cases")]);
    expect(p.blocking.join()).toContain("1 record(s) no mapping's filter claims (e.g. post:3)");
  });
});

describe("core blocks", () => {
  const html = [
    "<!-- wp:details --><details><summary>Prices</summary><!-- wp:paragraph --><p>Day rate</p><!-- /wp:paragraph -->",
    '<!-- wp:table --><figure class="wp-block-table"><table><thead><tr><th>Time</th><th>€</th></tr></thead><tbody><tr><td>Day</td><td>5,70</td></tr></tbody></table></figure><!-- /wp:table -->',
    "</details><!-- /wp:details -->",
    '<!-- wp:embed {"url":"https://youtu.be/x"} --><figure><div>https://youtu.be/x</div></figure><!-- /wp:embed -->',
  ].join("");
  const records = [{ key: "post:1", type: "page", title: "P", slug: "p", content: html }];

  it("become standard blocks when the content field declares them", async () => {
    const config = defineConfig({ collections: [collection("pages", standardBlocks())] });
    const p = await planImport(stage(records), config, [pageMapping()]);
    const [accordion, embed] = body(p);
    expect(accordion.blockType).toBe("accordion");
    expect(accordion.fields.title).toBe("Prices");
    expect(accordion.fields.body.map((i: any) => i.type)).toEqual(["text", "table"]);
    expect(accordion.fields.body[1].rows).toEqual([{ cells: "Time | €" }, { cells: "Day | 5,70" }]);
    expect(embed).toEqual({ type: "block", blockType: "embed", fields: { url: "https://youtu.be/x" } });
    expect(p.blocking).toEqual([]);
  });

  it("convert forms, raw HTML and legacy embeds once declared", async () => {
    const config = defineConfig({
      collections: [collection("pages", standardBlocks({ forms: true })), presets.forms],
    });
    const content = [
      '<!-- wp:gravityforms/form {"formId":"3","title":false,"inputPrimaryColor":"#204ce5"} /-->',
      '<!-- wp:shortcode -->[gravityform id="3" title="true"]<!-- /wp:shortcode -->',
      '<!-- wp:html --><div id="hs-form">Load the form</div><!-- /wp:html -->',
      '<!-- wp:core-embed/youtube {"url":"https://youtu.be/y"} --><figure>https://youtu.be/y</figure><!-- /wp:core-embed/youtube -->',
    ].join("");
    const p = await planImport(
      stage([
        { key: "post:1", type: "page", title: "P", slug: "p", content },
        { key: "form:3", type: "form", title: "Contact", fields: [] },
      ]),
      config,
      [pageMapping(), defineMapping({ source: "form", collection: "forms", map: (s, ctx) => ctx.form(s) })],
    );
    expect(body(p).map((n) => [n.blockType, n.fields])).toEqual([
      ["form", { form: "wp-form-3", showTitle: false, showDescription: true }],
      ["form", { form: "wp-form-3", showTitle: true, showDescription: false }],
      ["html", { code: '<div id="hs-form">Load the form</div>' }],
      ["embed", { url: "https://youtu.be/y" }],
    ]);
    expect(p.ledgers[0].paths.filter((x) => x.status === "unaccounted").map((x) => x.path)).toEqual([]);
    expect(p.blocking).toEqual([]);
  });

  it("fall back to plain content with one notice each when undeclared", async () => {
    const config = defineConfig({ collections: [collection("pages")] });
    const p = await planImport(stage(records), config, [pageMapping()]);
    expect(body(p).every((n) => n.type !== "block")).toBe(true);
    expect(p.ledgers[0].issues.filter((i) => i.message.includes("standardBlocks()")).length).toBe(3);
    expect(p.blocking).toEqual([]);
  });

  it("flags inner content a handler or auto-mapped block leaves out", async () => {
    const config = defineConfig({ collections: [collection("pages", { box: { url: fields.text() } })] });
    const content =
      '<!-- wp:acme/box {"url":"/x"} --><div><!-- wp:paragraph --><p>Text that must not vanish quietly</p><!-- /wp:paragraph --></div><!-- /wp:acme/box -->';
    const auto = await planImport(stage([{ key: "post:1", type: "page", title: "P", slug: "p", content }]), config, [
      pageMapping(),
    ]);
    expect(auto.ledgers[0].issues.some((i) => i.kind === "low-recall")).toBe(true);
    const handled = await planImport(stage([{ key: "post:1", type: "page", title: "P", slug: "p", content }]), config, [
      pageMapping({ blocks: { "acme/box": (b) => ({ type: "block", blockType: "box", fields: b.auto() }) } }),
    ]);
    expect(handled.ledgers[0].issues.some((i) => i.kind === "low-recall")).toBe(true);
  });

  it("counts text once when a handler reads innerHTML and converts pieces of it", async () => {
    const config = defineConfig({
      collections: [collection("pages", { card: { title: fields.text(), text: fields.text() } })],
    });
    const content =
      '<!-- wp:acme/card --><div class="card"><h3>Card title here</h3><p>Some card body text</p></div><!-- /wp:acme/card -->';
    const mapping = pageMapping({
      blocks: {
        "acme/card": (b, ctx) => ({
          type: "block",
          blockType: "card",
          fields: {
            title: ctx.text(/<h3>(.*?)<\/h3>/.exec(b.innerHTML)![1]),
            text: ctx.text(/<p>(.*?)<\/p>/.exec(b.innerHTML)![1]),
          },
        }),
      },
    });
    const p = await planImport(stage([{ key: "post:1", type: "page", title: "P", slug: "p", content }]), config, [
      mapping,
    ]);
    expect(p.ledgers[0].recall.min).toBe(1);
  });

  it("builds a parent block from its children's attributes", async () => {
    const config = defineConfig({
      collections: [
        collection("pages", {
          carousel: { cards: fields.json({ admin: { component: "repeater" }, itemFields: { title: fields.text() } }) },
        }),
      ],
    });
    const content =
      '<!-- wp:acme/carousel --><div><!-- wp:acme/card {"title":"First card"} /--><!-- wp:acme/card {"title":"Second card"} /--></div><!-- /wp:acme/carousel -->';
    const mapping = pageMapping({
      blocks: {
        "acme/carousel": (b) => ({
          type: "block",
          blockType: "carousel",
          fields: { cards: b.children().map((c) => ({ title: c.attrs.title })) },
        }),
      },
    });
    const p = await planImport(stage([{ ...records[0], content }]), config, [mapping]);
    expect(body(p)[0].fields.cards).toEqual([{ title: "First card" }, { title: "Second card" }]);
    expect(p.blocking).toEqual([]);
  });

  it("doesn't count inner text twice when a handler reads innerHTML and renders inner()", async () => {
    const config = defineConfig({ collections: [collection("pages", { box: { title: fields.text() } })] });
    const content =
      "<!-- wp:acme/box --><div><h3>Box title</h3><!-- wp:paragraph --><p>Inside the box</p><!-- /wp:paragraph --></div><!-- /wp:acme/box -->";
    const mapping = pageMapping({
      blocks: {
        "acme/box": (b) => [
          { type: "block", blockType: "box", fields: { title: /<h3>(.*?)<\/h3>/.exec(b.innerHTML)![1] } },
          ...b.inner().slice(0, b.inner().length),
        ],
      },
    });
    const p = await planImport(stage([{ ...records[0], content }]), config, [mapping]);
    expect(p.ledgers[0].recall.min).toBe(1);
  });
});

describe("more conversions", () => {
  it("keeps code verbatim and markup-only blocks as HTML once declared", async () => {
    const config = defineConfig({ collections: [collection("pages", standardBlocks())] });
    const content = [
      '<!-- wp:code --><pre class="wp-block-code"><code class="language-js">if (a &lt; b) {\n  go();\n}</code></pre><!-- /wp:code -->',
      '<!-- wp:shortcode --><ld-slot name="booking"></ld-slot><!-- /wp:shortcode -->',
    ].join("");
    const p = await planImport(stage([{ key: "post:1", type: "page", title: "P", slug: "p", content }]), config, [
      pageMapping(),
    ]);
    expect(body(p).map((n) => [n.blockType, n.fields])).toEqual([
      ["code", { language: "js", code: "if (a < b) {\n  go();\n}" }],
      ["html", { code: '<ld-slot name="booking"></ld-slot>' }],
    ]);
  });

  it("warns instead of silently dropping markup-only blocks when html isn't declared", async () => {
    const config = defineConfig({ collections: [collection("pages")] });
    const content = '<!-- wp:shortcode --><ld-slot name="booking"></ld-slot><!-- /wp:shortcode -->';
    const p = await planImport(stage([{ key: "post:1", type: "page", title: "P", slug: "p", content }]), config, [
      pageMapping(),
    ]);
    expect(p.ledgers[0].issues.some((i) => i.message.includes("holds markup but no text"))).toBe(true);
  });

  it("treats Polylang's per-language copies of one file as the same medium", async () => {
    const config = defineConfig({
      locales: { default: "en", supported: ["en", "fi"] },
      collections: [collection("pages", {}, { image: fields.image() })],
    });
    const pages = [
      { key: "post:1", type: "page", title: "Hi", slug: "hi", locale: "en", group: "g", featuredImage: 10 },
      { key: "post:2", type: "page", title: "Moi", slug: "moi", locale: "fi", group: "g", featuredImage: 11 },
    ];
    const media = [
      { key: "att:10", id: 10, file: "2025/01/photo.jpg" },
      { key: "att:11", id: 11, file: "2025/01/photo.jpg" },
    ];
    const mapping = pageMapping({
      map: (src, ctx) => ({ title: src.title, slug: src.slug, image: ctx.media(src.featuredImage) }),
    });
    const p = await planImport(stage(pages, media), config, [mapping]);
    expect(p.ledgers[0].issues.filter((i) => i.message.startsWith('"image"'))).toEqual([]);
    expect(p.docs[0].media).toHaveLength(1);
  });

  it("splits bundled term names in the tree and in post values", () => {
    expect(
      termSlugs(
        [
          { name: "Business|Press releases", slug: "business-press" },
          { name: "News", slug: "news" },
        ],
        { split: true },
      ),
    ).toEqual(["business", "press-releases", "news"]);
  });

  it("stages an empty ACF list field as an empty array", () => {
    expect(nestAcf({ rows: "", _rows: "field_1", title: "" }, new Set(["field_1"]))).toEqual({ rows: [], title: "" });
  });
});

describe("mapping by shape", () => {
  it("fills a collection from the record and ACF meta, and ACF blocks from their data", async () => {
    const config = defineConfig({
      collections: [
        collection(
          "pages",
          {
            hero: {
              heading: fields.text(),
              image: fields.image(),
              cta: fields.link(),
              rows: fields.json({ admin: { component: "repeater" }, itemFields: { label: fields.text() } }),
            },
          },
          { image: fields.image(), subtitle: fields.text(), featured: fields.boolean(), seoDescription: fields.text() },
        ),
      ],
    });
    const data = {
      heading: "Big title",
      image: 7,
      cta: { url: "https://x.test/", title: "Go" },
      rows: [{ label: "One" }],
    };
    const content = `<!-- wp:acf/hero ${JSON.stringify({ name: "acf/hero", data })} /-->`;
    const page = {
      key: "post:1",
      type: "page",
      title: "About us",
      slug: "about",
      content,
      featuredImage: 7,
      meta: { sub_title: "x", subtitle: "Who we are", featured: "1", _yoast_wpseo_metadesc: "All about us" },
    };
    const mapping = pageMapping({ map: (src, ctx) => ctx.auto(src), drop: { "meta.sub_title": "legacy" } });
    const p = await planImport(stage([page], [{ key: "att:7", id: 7, file: "2025/01/a.jpg" }]), config, [mapping]);
    const doc = p.docs[0].data as any;
    expect([doc.title, doc.slug, doc.subtitle, doc.featured, doc.seoDescription]).toEqual([
      "About us",
      "about",
      "Who we are",
      true,
      "All about us",
    ]);
    expect(doc.image).toMatch(/kide-media/);
    const [hero] = doc.body.children;
    expect(hero.blockType).toBe("hero");
    expect(hero.fields.heading).toBe("Big title");
    expect(hero.fields.cta).toMatchObject({ url: "https://x.test/", label: "Go" });
    expect(hero.fields.rows).toEqual([{ label: "One" }]);
    expect(p.blocking).toEqual([]);
  });

  it("points redirect targets at moved documents, keeping their sources", async () => {
    const config = defineConfig({
      collections: [collection("pages"), presets.redirects],
    });
    const p = await planImport(
      stage([
        { key: "post:1", type: "page", title: "Child", slug: "child", permalink: "/parent/child/" },
        { key: "redirect:1", type: "redirect", from: "/old/", to: "https://example.com/parent/child/" },
      ]),
      config,
      [
        defineMapping({ source: "page", collection: "pages", map: (s) => ({ title: s.title, slug: s.slug }) }),
        defineMapping({ source: "redirect", collection: "redirects", map: (s) => ({ from: s.from, to: s.to }) }),
      ],
    );
    expect(p.docs.find((d) => d.collection === "redirects")!.data).toMatchObject({ from: "/old/", to: "/child" });
  });

  it("maps plugin blocks from their attributes, and post ids in link rows to references", async () => {
    const config = defineConfig({
      collections: [
        collection("pages", {
          linkList: {
            showIcons: fields.boolean(),
            links: fields.json({
              admin: { component: "repeater" },
              itemFields: { url: fields.link(), text: fields.text() },
            }),
          },
        }),
      ],
    });
    const attrs = {
      showIcons: true,
      links: [
        { url: 2, text: "Prices" },
        { url: 99, text: "Gone" },
      ],
    };
    const content = `<!-- wp:exf/link-list ${JSON.stringify(attrs)} /-->`;
    const p = await planImport(
      stage([
        { key: "post:1", type: "page", title: "P", slug: "p", content },
        { key: "post:2", type: "page", title: "Prices", slug: "prices", permalink: "/prices/" },
      ]),
      config,
      [pageMapping()],
    );
    const [list] = body(p);
    expect(list.blockType).toBe("linkList");
    expect(list.fields.links).toEqual([
      { url: expect.objectContaining({ type: "reference", docId: "wp-2" }), text: "Prices" },
      { text: "Gone" },
    ]);
    expect(p.ledgers[0].issues.some((i) => i.message.includes("post 99 isn't imported"))).toBe(true);
  });

  it("lets a handler spread b.auto() and override one field; image reads imageId; snapshots fall back to url", async () => {
    const config = defineConfig({
      collections: [
        collection("pages", {
          hero: { heroTitle: fields.text(), phone: fields.text(), image: fields.image(), media: fields.image() },
        }),
      ],
    });
    const attrs = {
      heroTitle: "Order a taxi",
      heroCTA: { number: "0100 0700" },
      imageId: 7,
      media: { id: 1060, url: "https://example.com/wp-content/uploads/2025/01/a.jpg", nonces: {} },
    };
    const content = `<!-- wp:exf/hero ${JSON.stringify(attrs)} /-->`;
    const mapping = pageMapping({
      blocks: {
        "exf/hero": (b) => ({
          type: "block",
          blockType: "hero",
          fields: { ...b.auto(), phone: b.attrs.heroCTA?.number },
        }),
      },
    });
    const p = await planImport(
      stage(
        [{ key: "post:1", type: "page", title: "P", slug: "p", content }],
        [{ key: "att:7", id: 7, file: "2025/01/a.jpg" }],
      ),
      config,
      [mapping],
    );
    const [hero] = body(p);
    expect(hero.fields).toMatchObject({ heroTitle: "Order a taxi", phone: "0100 0700" });
    expect(hero.fields.image).toMatch(/kide-media/);
    expect(hero.fields.media).toBe(hero.fields.image);
    expect(p.blocking).toEqual([]);
  });

  it("fills a parent block from its child blocks and core blocks by name", async () => {
    const config = defineConfig({
      collections: [
        collection("pages", {
          serviceCarousel: {
            heading: fields.text(),
            cards: fields.json({ admin: { component: "repeater" }, itemFields: { title: fields.text() } }),
          },
          rss: { feedURL: fields.text(), itemsToShow: fields.number() },
        }),
      ],
    });
    const content = [
      "<!-- wp:exf/service-carousel --><div><!-- wp:group --><div><!-- wp:heading --><h2>Our services</h2><!-- /wp:heading --></div><!-- /wp:group -->",
      '<!-- wp:exf/service-card {"title":"Pet taxi"} /--><!-- wp:exf/service-card {"title":"Airport taxi"} /-->',
      "</div><!-- /wp:exf/service-carousel -->",
      '<!-- wp:rss {"feedURL":"https://x.test/feed","itemsToShow":5} /-->',
    ].join("");
    const p = await planImport(stage([{ key: "post:1", type: "page", title: "P", slug: "p", content }]), config, [
      pageMapping(),
    ]);
    expect(body(p).map((n) => [n.blockType, n.fields])).toEqual([
      ["serviceCarousel", { heading: "Our services", cards: [{ title: "Pet taxi" }, { title: "Airport taxi" }] }],
      ["rss", { feedURL: "https://x.test/feed", itemsToShow: 5 }],
    ]);
    expect(p.blocking).toEqual([]);
  });

  it("drops redirects that point at themselves, hide a route or duplicate another", async () => {
    const config = defineConfig({ collections: [collection("pages"), presets.redirects] });
    const p = await planImport(
      stage([
        { key: "post:1", type: "page", title: "Child", slug: "child", permalink: "/parent/child/" },
        { key: "redirect:1", type: "redirect", from: "/old/", to: "/old" },
        { key: "redirect:2", type: "redirect", from: "/child/", to: "/elsewhere/" },
        { key: "redirect:3", type: "redirect", from: "/parent/child/", to: "/elsewhere/" },
      ]),
      config,
      [
        defineMapping({ source: "page", collection: "pages", map: (s) => ({ title: s.title, slug: s.slug }) }),
        defineMapping({ source: "redirect", collection: "redirects", map: (s) => ({ from: s.from, to: s.to }) }),
        defineMapping({
          source: "url-change",
          collection: "redirects",
          map: (s) => ({ from: s.from, to: s.to }),
        }),
      ],
    );
    expect(p.docs.filter((d) => d.collection === "redirects").map((d) => d.sourceKeys[0])).toEqual(["redirect:3"]);
  });

  it("fills a taxonomy field from a term list whatever its spelling", async () => {
    const config = defineConfig({
      collections: [
        defineCollection({
          slug: "people",
          labels: { singular: "p", plural: "p" },
          fields: { title: fields.text(), jobTitles: fields.taxonomy({ taxonomy: "job-titles", hasMany: true }) },
        }),
      ],
    });
    const p = await planImport(
      stage([
        {
          key: "post:1",
          type: "person",
          title: "Ann",
          terms: { job_title: [{ id: 3, slug: "developer", name: "Developer" }] },
        },
      ]),
      config,
      [defineMapping({ source: "person", collection: "people", map: (s, ctx) => ctx.auto(s) })],
    );
    expect(p.docs[0].data.jobTitles).toEqual(["developer"]);
  });

  it("says when translations leave a text field empty and inherit the original", async () => {
    const config = defineConfig({
      locales: { default: "fi", supported: ["fi", "en"] },
      collections: [
        defineCollection({
          slug: "pages",
          labels: { singular: "p", plural: "p" },
          fields: { title: fields.text({ translatable: true }), intro: fields.text({ translatable: true }) },
        }),
      ],
    });
    const p = await planImport(
      stage([
        { key: "post:1", type: "page", title: "Hei", locale: "fi", group: "g", meta: { intro: "Tervetuloa" } },
        { key: "post:2", type: "page", title: "Hi", locale: "en", group: "g", meta: {} },
      ]),
      config,
      [defineMapping({ source: "page", collection: "pages", map: (s, ctx) => ctx.auto(s) })],
    );
    expect(p.ledgers[0].issues.find((i) => i.message.startsWith('"intro" is empty'))?.kind).toBe("translation-advice");
  });
});

describe("shortcodes and snapshots", () => {
  it("splices content nodes a shortcode handler returns", async () => {
    const config = defineConfig({ collections: [collection("pages", { form: { id: fields.text() } })] });
    const content =
      '<!-- wp:paragraph --><p>Before</p><!-- /wp:paragraph --><!-- wp:shortcode -->[gravityform id="4"]<!-- /wp:shortcode -->';
    const mapping = pageMapping({
      shortcodes: { gravityform: (a) => ({ type: "block", blockType: "form", fields: { id: a.id } }) },
    });
    const p = await planImport(stage([{ key: "post:1", type: "page", title: "P", slug: "p", content }]), config, [
      mapping,
    ]);
    expect(body(p).map((n) => n.blockType ?? n.type)).toEqual(["paragraph", "form"]);
    expect(p.blocking).toEqual([]);
  });

  it("accounts media-modal snapshots by their id alone", async () => {
    const config = defineConfig({ collections: [collection("pages", { hero: { title: fields.text() } })] });
    const attrs = { heroTitle: "Hi there", heroMedia: { id: 7, url: "/x.jpg", nonces: { edit: "x" }, sizes: {} } };
    const content = `<!-- wp:acme/hero ${JSON.stringify(attrs)} /-->[menu_order]`;
    const mapping = pageMapping({
      blocks: { "acme/hero": (b) => ({ type: "block", blockType: "hero", fields: { title: b.attrs.heroTitle } }) },
      shortcodes: { "*": "keep" },
    });
    const p = await planImport(stage([{ key: "post:1", type: "page", title: "P", slug: "p", content }]), config, [
      mapping,
    ]);
    expect(p.ledgers[0].paths.filter((x) => x.status === "unaccounted").map((x) => x.path)).toEqual([
      "block:acme/hero.attrs.heroMedia.id",
    ]);
  });
});

describe("WordPress structures", () => {
  const config = defineConfig({
    locales: { default: "en", supported: ["en"] },
    collections: [collection("pages"), presets.menus, presets.taxonomies, presets.forms],
  });
  const records = [
    { key: "post:1", type: "page", title: "About", slug: "about", permalink: "/company/about/" },
    { key: "post:2", type: "page", title: "Company", slug: "company", permalink: "/company/" },
    { key: "term:9", type: "term:nav_menu", name: "Main", slug: "main", location: "primary" },
    ...[
      [11, 2, "0", ""],
      [12, 1, "11", "Who we are"],
    ].map(([id, target, parent, title]) => ({
      key: `post:${id}`,
      type: "nav_menu_item",
      title,
      menuOrder: id,
      terms: { nav_menu: [{ id: 9 }] },
      meta: {
        _menu_item_type: "post_type",
        _menu_item_object: "page",
        _menu_item_object_id: String(target),
        _menu_item_menu_item_parent: parent,
      },
    })),
    { key: "taxonomy:category", type: "taxonomy", id: 100, taxonomy: "category" },
    { key: "term:5", type: "term:category", name: "News", slug: "news" },
    { key: "term:6", type: "term:category", name: "Press", slug: "press", parent: 5 },
    {
      key: "form:3",
      type: "form",
      title: "Contact us",
      button: "Send",
      confirmation: { type: "message", message: "<p>Thanks a lot</p>" },
      fields: [
        {
          id: 1,
          type: "name",
          label: "Name",
          inputs: [
            { id: "1.3", label: "First" },
            { id: "1.6", label: "Last" },
          ],
        },
        {
          id: 2,
          type: "select",
          label: "Topic",
          isRequired: true,
          choices: [{ text: "Billing, invoices", value: "billing" }],
        },
        {
          id: 3,
          type: "chainedselect",
          label: "Area",
          inputs: [
            { id: "3.1", label: "Region" },
            { id: "3.2", label: "City" },
          ],
          choices: [{ text: "Uusimaa", value: "uusimaa", choices: [{ text: "Espoo", value: "espoo" }] }],
        },
      ],
    },
  ];
  const mappings: Mapping[] = [
    defineMapping({ source: "page", collection: "pages", map: (s) => ({ title: s.title, slug: s.slug }) }),
    defineMapping({
      source: "term:nav_menu",
      collection: "menus",
      includes: ["nav_menu_item"],
      map: (s, ctx) => ({ name: s.name, slug: s.location, items: ctx.menuItems(s) }),
      drop: { slug: "the location is the slug" },
    }),
    defineMapping({
      source: "taxonomy",
      collection: "taxonomies",
      includes: ["term:category"],
      map: (s, ctx) => ({ name: "Categories", slug: "categories", terms: ctx.termTree(s) }),
    }),
    defineMapping({ source: "form", collection: "forms", id: (s) => `form-${s.id}`, map: (s, ctx) => ctx.form(s) }),
  ];

  it("builds menus, term trees and forms, with links pointing at the Kide routes", async () => {
    const p = await planImport(stage(records), config, mappings);
    const doc = (id: string) => p.docs.find((d) => d.docId === id)!.data;
    expect(doc("wp-term-9").items).toEqual([
      {
        id: "item-11",
        label: "Company",
        href: "/company",
        children: [{ id: "item-12", label: "Who we are", href: "/about", children: [] }],
      },
    ]);
    expect(doc("wp-1").slug).toBe("about");
    expect(doc("wp-taxonomy-category").terms).toEqual([
      {
        id: "term-5",
        name: "News",
        slug: "news",
        children: [{ id: "term-6", name: "Press", slug: "press", children: [] }],
      },
    ]);
    const form = doc("form-3");
    expect(form.successMessage).toBe("Thanks a lot");
    expect((form.fields as any[]).map((f) => [f.type, f.name, f.options])).toEqual([
      ["text", "name-first", undefined],
      ["text", "name-last", undefined],
      ["select", "topic", ["Billing, invoices"]],
      ["select", "region", ["Uusimaa"]],
      ["select", "city", ["Espoo"]],
    ]);
    expect(p.blocking).toEqual([]);
  });
});

describe("scout", () => {
  it("detects Bedrock: site root without /wp, uploads under /app/uploads", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "kide-bedrock-"));
    dirs.push(dir);
    const sql = readFileSync(path.join(import.meta.dirname, "fixtures", "wp.sql"), "utf8")
      .replace("'siteurl','https://example.com'", "'siteurl','https://example.com/wp'")
      .replace("'home','https://example.com'", "'home','https://example.com/wp'");
    const dump = path.join(dir, "bedrock.sql");
    writeFileSync(dump, sql);
    const staging = openStaging(dir);
    const summary = await scoutWordPress(staging, dump);
    expect(summary.siteUrl).toBe("https://example.com");
    expect(staging.prepare("SELECT value FROM source_meta WHERE key = 'uploadsUrl'").get()).toEqual({
      value: "https://example.com/app/uploads",
    });
    staging.close();
  });
});
