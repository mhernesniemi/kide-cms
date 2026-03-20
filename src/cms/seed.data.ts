import type { SeedDocument } from "./core/define";

const seeds: Record<string, SeedDocument[]> = {
  authors: [
    {
      _id: "author_maya",
      name: "Maya Rinne",
      slug: "maya-rinne",
      title: "Editor in chief",
      bio: {
        type: "root",
        children: [
          {
            type: "paragraph",
            children: [
              {
                type: "text",
                value: "Leads the editorial direction across product, design, and growth.",
              },
            ],
          },
        ],
      },
      avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=800&q=80",
    },
  ],
  posts: [
    {
      title: "Launch faster with an editorial system your team can actually own",
      slug: "launch-faster-with-an-editorial-system-your-team-can-actually-own",
      excerpt:
        "A code-first CMS can feel deeply custom without becoming fragile. Here is what that looks like in practice.",
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
  taxonomies: [
    {
      name: "Categories",
      slug: "categories",
      terms: JSON.stringify([
        {
          id: "t1",
          name: "Technology",
          slug: "technology",
          children: [
            { id: "t2", name: "Software", slug: "software", children: [] },
            { id: "t3", name: "Hardware", slug: "hardware", children: [] },
          ],
        },
        { id: "t4", name: "Design", slug: "design", children: [] },
        { id: "t5", name: "Business", slug: "business", children: [] },
      ]),
    },
    {
      name: "Tags",
      slug: "tags",
      terms: JSON.stringify([
        { id: "t6", name: "Astro", slug: "astro", children: [] },
        { id: "t7", name: "CMS", slug: "cms", children: [] },
        { id: "t8", name: "Open Source", slug: "open-source", children: [] },
      ]),
    },
  ],
  "front-page": [
    {
      heroHeading: "Welcome to Kide CMS",
      heroBody: "A code-first, single-schema CMS built inside Astro.",
      heroCtaLabel: "Get started",
      heroCtaHref: "/admin",
    },
  ],
  menus: [
    {
      name: "Main Navigation",
      slug: "main",
      items: JSON.stringify([
        { id: "m1", label: "Home", href: "/", children: [] },
        { id: "m2", label: "Blog", href: "/blog", children: [] },
        {
          id: "m3",
          label: "About",
          href: "/about",
          children: [{ id: "m4", label: "Team", href: "/about/team", children: [] }],
        },
      ]),
    },
  ],
  pages: [
    {
      title: "Kide CMS",
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
            title: "Kide CMS",
            slug: "etusivu",
            summary: "Astroon rakennettu monoliittinen ja koodilahtoinen CMS-kokemus.",
          },
        },
      ],
    },
  ],
};

export default seeds;
