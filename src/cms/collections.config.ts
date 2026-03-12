import { defineCollection, defineConfig, fields } from "./core/define";

export default defineConfig({
  database: { dialect: "json-file" },
  storage: {
    adapter: "json-file",
    root: ".cms-data",
  },
  locales: {
    default: "en",
    supported: ["en", "fi", "sv"],
  },
  collections: [
    defineCollection({
      slug: "authors",
      labels: { singular: "Author", plural: "Authors" },
      timestamps: true,
      fields: {
        name: fields.text({ required: true }),
        slug: fields.slug({ from: "name", unique: true }),
        role: fields.text({ required: true }),
        bio: fields.richText({ translatable: true }),
        avatar: fields.image({
          admin: { placeholder: "https://images.example.com/avatar.jpg" },
        }),
      },
      seed: [
        {
          _id: "author_maya",
          name: "Maya Rinne",
          slug: "maya-rinne",
          role: "Editor in chief",
          bio: {
            type: "root",
            children: [
              {
                type: "paragraph",
                children: [{ type: "text", value: "Leads the editorial direction across product, design, and growth." }],
              },
            ],
          },
          avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=800&q=80",
        },
      ],
    }),
    defineCollection({
      slug: "posts",
      labels: { singular: "Post", plural: "Posts" },
      pathPrefix: "blog",
      timestamps: true,
      drafts: true,
      versions: { max: 20 },
      fields: {
        title: fields.text({ required: true, indexed: true, translatable: true }),
        slug: fields.slug({ from: "title", unique: true, translatable: true }),
        excerpt: fields.text({ maxLength: 300, translatable: true, admin: { rows: 3 } }),
        body: fields.richText({ translatable: true, admin: { rows: 14 } }),
        cover: fields.image({ admin: { placeholder: "/images/post-cover.jpg" } }),
        category: fields.select({
          options: ["Product", "Design", "Engineering", "Business"],
          defaultValue: "Product",
        }),
        author: fields.relation({ collection: "authors" }),
        tags: fields.array({ of: fields.text(), defaultValue: [] }),
        metadata: fields.json({
          defaultValue: {},
          admin: { rows: 6, help: "JSON object for SEO extras." },
        }),
        sortOrder: fields.number({ defaultValue: 0 }),
      },
      seed: [
        {
          title: "Launch faster with an editorial system your team can actually own",
          slug: "launch-faster-with-an-editorial-system-your-team-can-actually-own",
          excerpt: "A code-first CMS can feel deeply custom without becoming fragile. Here is what that looks like in practice.",
          body: {
            type: "root",
            children: [
              {
                type: "paragraph",
                children: [
                  {
                    type: "text",
                    value:
                      "This starter shows how content modeling, publishing, and public delivery can live in one Astro app without a maze of services.",
                  },
                ],
              },
              {
                type: "heading",
                level: 2,
                children: [{ type: "text", value: "Why this shape works" }],
              },
              {
                type: "paragraph",
                children: [
                  {
                    type: "text",
                    value:
                      "Editors get a focused admin. Developers get code they can inspect, test, and extend. The public site stays tightly connected to the content model.",
                  },
                ],
              },
            ],
          },
          cover: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1600&q=80",
          category: "Engineering",
          author: "author_maya",
          tags: ["astro", "cms", "content systems"],
          metadata: {
            ogTitle: "Launch faster with an editorial system your team can actually own",
          },
          sortOrder: 10,
          _status: "published",
          _translations: [
            {
              locale: "fi",
              values: {
                title: "Julkaise nopeammin sisaltojarjestelmalla jonka tiimi oikeasti omistaa",
                slug: "julkaise-nopeammin-sisaltojarjestelmalla-jonka-tiimi-oikeasti-omistaa",
                excerpt: "Koodilahtoinen CMS voi tuntua aidosti omalta ilman haurasta monimutkaisuutta.",
              },
            },
          ],
        },
      ],
    }),
    defineCollection({
      slug: "pages",
      labels: { singular: "Page", plural: "Pages" },
      timestamps: true,
      drafts: true,
      versions: { max: 20 },
      fields: {
        title: fields.text({ required: true, translatable: true }),
        slug: fields.slug({ from: "title", unique: true, translatable: true }),
        summary: fields.text({ translatable: true, admin: { rows: 3 } }),
        layout: fields.select({
          options: ["default", "landing", "docs"],
          defaultValue: "landing",
        }),
        heroImage: fields.image(),
        blocks: fields.blocks({
          translatable: true,
          types: {
            hero: {
              eyebrow: fields.text(),
              heading: fields.text({ required: true }),
              body: fields.text(),
              ctaLabel: fields.text(),
              ctaHref: fields.text(),
            },
            text: {
              heading: fields.text(),
              content: fields.richText(),
            },
            gallery: {
              images: fields.array({ of: fields.image(), defaultValue: [] }),
            },
          },
        }),
      },
      seed: [
        {
          title: "AstroCMS",
          slug: "home",
          summary: "A monolithic, code-first CMS experience built inside Astro.",
          layout: "landing",
          heroImage: "https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1600&q=80",
          blocks: [
            {
              type: "hero",
              heading: "Operate your content system in code, not in a maze of settings",
              eyebrow: "Astro-native CMS",
              body: "Define collections once, manage content in an admin, and publish straight from the same app.",
              ctaLabel: "Open admin",
              ctaHref: "/admin",
            },
            {
              type: "text",
              heading: "A strong v1",
              content: {
                type: "root",
                children: [
                  {
                    type: "paragraph",
                    children: [
                      {
                        type: "text",
                        value:
                          "This implementation focuses on the highest-leverage parts of the spec: single-schema content modeling, generated artifacts, a local API, a runtime admin, version history, and localized content.",
                      },
                    ],
                  },
                ],
              },
            },
          ],
          _status: "published",
          _translations: [
            {
              locale: "fi",
              values: {
                title: "AstroCMS",
                slug: "etusivu",
                summary: "Astroon rakennettu monoliittinen ja koodilahtoinen CMS-kokemus.",
              },
            },
          ],
        },
      ],
    }),
  ],
});
