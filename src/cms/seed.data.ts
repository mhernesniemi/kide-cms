import type { SeedDocument } from "./core/define";

const seeds: Record<string, SeedDocument[]> = {
  authors: [
    {
      _id: "author_maya",
      name: "Maya Rinne",
      slug: "maya-rinne",
      title: "Editor in Chief",
      description: "Leads the editorial direction across product, design, and growth.",
      avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=800&q=80",
    },
    {
      _id: "author_leo",
      name: "Leo Virtanen",
      slug: "leo-virtanen",
      title: "Lead Developer",
      description: "Full-stack engineer with a focus on developer experience and content infrastructure.",
      avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=800&q=80",
    },
    {
      _id: "author_anna",
      name: "Anna Korhonen",
      slug: "anna-korhonen",
      title: "Design Lead",
      description: "Brings clarity to complex interfaces through systems thinking and user research.",
      avatar: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&w=800&q=80",
    },
  ],
  posts: [
    {
      title: "Getting Started with Kide CMS",
      slug: "getting-started-with-kide-cms",
      excerpt: "Everything you need to know to set up your first project with Kide CMS and start managing content.",
      body: {
        type: "root",
        children: [
          {
            type: "paragraph",
            children: [
              {
                type: "text",
                value:
                  "Kide CMS is a code-first content management system built inside Astro. It takes a different approach from traditional CMSes — instead of configuring everything through a GUI, you define your content schema in TypeScript.",
              },
            ],
          },
          {
            type: "heading",
            level: 2,
            children: [{ type: "text", value: "Why code-first?" }],
          },
          {
            type: "paragraph",
            children: [
              {
                type: "text",
                value:
                  "Code-first means your content model is version-controlled, reviewable in pull requests, and can be reasoned about by both humans and AI agents. There is no hidden configuration — everything is in your codebase.",
              },
            ],
          },
          {
            type: "heading",
            level: 2,
            children: [{ type: "text", value: "Quick setup" }],
          },
          {
            type: "paragraph",
            children: [
              { type: "text", value: "Run " },
              { type: "text", value: "pnpx create-kide-app my-site", bold: true },
              { type: "text", value: " and you will have a working CMS in under a minute. The admin panel is at " },
              { type: "text", value: "/admin", bold: true },
              { type: "text", value: "." },
            ],
          },
          {
            type: "heading",
            level: 2,
            children: [{ type: "text", value: "What you get" }],
          },
          {
            type: "list",
            ordered: false,
            children: [
              {
                type: "list-item",
                children: [
                  {
                    type: "paragraph",
                    children: [
                      { type: "text", value: "A runtime admin UI with field editors, data tables, and live preview" },
                    ],
                  },
                ],
              },
              {
                type: "list-item",
                children: [
                  {
                    type: "paragraph",
                    children: [{ type: "text", value: "Drafts, publishing, scheduling, and version history" }],
                  },
                ],
              },
              {
                type: "list-item",
                children: [
                  {
                    type: "paragraph",
                    children: [{ type: "text", value: "Internationalization with per-field translation tables" }],
                  },
                ],
              },
              {
                type: "list-item",
                children: [
                  {
                    type: "paragraph",
                    children: [{ type: "text", value: "Asset management with folders and focal point cropping" }],
                  },
                ],
              },
            ],
          },
        ],
      },
      category: "technology",
      author: "author_leo",
      sortOrder: 30,
      _status: "published",
      _translations: [
        {
          locale: "fi",
          values: {
            title: "Kide CMS:n käyttöönotto",
            slug: "kide-cmsin-kayttoonotto",
            excerpt: "Kaikki mitä tarvitset ensimmäisen Kide CMS -projektisi pystyttämiseen.",
          },
        },
      ],
    },
    {
      title: "Designing Content Models That Scale",
      slug: "designing-content-models-that-scale",
      excerpt:
        "How to structure your collections, fields, and relations so your content architecture grows with your project.",
      body: {
        type: "root",
        children: [
          {
            type: "paragraph",
            children: [
              {
                type: "text",
                value:
                  "A well-designed content model is the foundation of any CMS project. Get it right and adding features is straightforward. Get it wrong and you will be fighting your own schema.",
              },
            ],
          },
          {
            type: "heading",
            level: 2,
            children: [{ type: "text", value: "Start with the output" }],
          },
          {
            type: "paragraph",
            children: [
              {
                type: "text",
                value:
                  "Before defining collections, sketch the pages you need to render. What content appears on each page? What is shared across pages? This tells you which fields belong on which collections, and where relations make sense.",
              },
            ],
          },
          {
            type: "heading",
            level: 2,
            children: [{ type: "text", value: "Keep it flat" }],
          },
          {
            type: "paragraph",
            children: [
              {
                type: "text",
                value:
                  "Resist the urge to nest everything. A post with an author relation is simpler than a post with an embedded author object. Relations keep your data normalized and your queries predictable.",
              },
            ],
          },
          {
            type: "quote",
            children: [
              {
                type: "paragraph",
                children: [
                  {
                    type: "text",
                    value:
                      "The best content model is the one that makes the common case simple and the edge case possible.",
                    italic: true,
                  },
                ],
              },
            ],
          },
        ],
      },
      category: "design",
      author: "author_anna",
      sortOrder: 20,
      _status: "published",
      _translations: [
        {
          locale: "fi",
          values: {
            title: "Sisältömallien suunnittelu skaalautuvasti",
            slug: "sisaltomallien-suunnittelu-skaalautuvasti",
            excerpt:
              "Kuinka rakentaa kokoelmat, kentät ja relaatiot niin, että sisältöarkkitehtuuri kasvaa projektisi mukana.",
          },
        },
      ],
    },
    {
      title: "The Local API Pattern",
      slug: "the-local-api-pattern",
      excerpt: "Why Kide CMS uses plain function calls instead of HTTP endpoints for content operations.",
      body: {
        type: "root",
        children: [
          {
            type: "paragraph",
            children: [
              {
                type: "text",
                value:
                  "Most headless CMSes force you to fetch content over HTTP, even when the CMS and the frontend run in the same process. Kide CMS takes a different approach.",
              },
            ],
          },
          {
            type: "heading",
            level: 2,
            children: [{ type: "text", value: "Import, don't fetch" }],
          },
          {
            type: "paragraph",
            children: [
              { type: "text", value: "With Kide, content operations are plain TypeScript imports: " },
              { type: "text", value: "cms.posts.find()", bold: true },
              {
                type: "text",
                value:
                  " is a direct function call, not an HTTP round-trip. No serialization overhead, no network latency, full type safety.",
              },
            ],
          },
          {
            type: "heading",
            level: 2,
            children: [{ type: "text", value: "When HTTP is needed" }],
          },
          {
            type: "paragraph",
            children: [
              {
                type: "text",
                value:
                  "The admin UI runs as React islands that need to talk to the server. For this, a thin HTTP layer wraps the same local API. But your public pages never go through HTTP — they call the API directly.",
              },
            ],
          },
        ],
      },
      category: "technology",
      author: "author_leo",
      sortOrder: 10,
      _status: "published",
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
            { id: "t2", name: "Frontend", slug: "frontend", children: [] },
            { id: "t3", name: "Backend", slug: "backend", children: [] },
            { id: "t9", name: "DevOps", slug: "devops", children: [] },
          ],
        },
        {
          id: "t4",
          name: "Design",
          slug: "design",
          children: [
            { id: "t10", name: "UI Design", slug: "ui-design", children: [] },
            { id: "t11", name: "UX Research", slug: "ux-research", children: [] },
          ],
        },
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
        { id: "t12", name: "TypeScript", slug: "typescript", children: [] },
        { id: "t13", name: "Tutorial", slug: "tutorial", children: [] },
      ]),
    },
  ],
  menus: [
    {
      name: "Main Navigation",
      slug: "main",
      items: JSON.stringify([
        { id: "m1", label: "Home", href: "/", children: [] },
        { id: "m2", label: "Blog", href: "/blog", children: [] },
        { id: "m3", label: "About", href: "/about", children: [] },
      ]),
    },
    {
      name: "Footer",
      slug: "footer",
      items: JSON.stringify([
        { id: "f1", label: "Home", href: "/", children: [] },
        { id: "f2", label: "Blog", href: "/blog", children: [] },
        { id: "f3", label: "About", href: "/about", children: [] },
        { id: "f4", label: "GitHub", href: "https://github.com/mhernesniemi/kide-cms", target: "_blank", children: [] },
      ]),
    },
  ],
  pages: [
    {
      title: "About",
      slug: "about",
      summary: "Learn more about Kide CMS and the ideas behind it.",
      layout: "default",
      blocks: [
        {
          type: "hero",
          eyebrow: "About",
          heading: "Built for developers who ship content sites",
          body: "Kide CMS started as a question: what if the CMS was just part of your app, not a separate service?",
        },
        {
          type: "text",
          heading: "Philosophy",
          content: {
            type: "root",
            children: [
              {
                type: "paragraph",
                children: [
                  {
                    type: "text",
                    value:
                      "Most CMS platforms are either too simple for real projects or too complex to understand. Kide aims for the middle ground: enough structure to handle content-heavy sites, simple enough that one developer can understand the entire system.",
                  },
                ],
              },
              {
                type: "paragraph",
                children: [
                  {
                    type: "text",
                    value:
                      "Everything is code. The schema is TypeScript. The admin renders from that schema. The API is generated from it. There is one source of truth and it lives in your repository.",
                  },
                ],
              },
            ],
          },
        },
        {
          type: "faq",
          heading: "Frequently asked questions",
          items: [
            {
              title: "Who is this for?",
              description:
                "Developers and small teams building content-driven websites who want full control over their CMS without maintaining a separate service.",
            },
            {
              title: "What makes this different from Payload or Strapi?",
              description:
                "Kide runs inside your Astro app — same process, same deployment. No separate API server, no external database to manage in development. Relations return IDs, not auto-populated documents, so queries are always predictable.",
            },
            {
              title: "Is it production-ready?",
              description:
                "The core features are solid: collections, fields, admin UI, drafts, versioning, i18n, access control, and caching. It is actively developed and used in real projects.",
            },
          ],
        },
      ],
      _status: "published",
      _translations: [
        {
          locale: "fi",
          values: {
            title: "Tietoa",
            slug: "tietoa",
            summary: "Lue lisää Kide CMS:stä ja sen taustalla olevista ideoista.",
          },
        },
      ],
    },
  ],
  "front-page": [
    {
      blocks: [
        {
          type: "hero",
          eyebrow: "Astro-native CMS",
          heading: "Your content, your code, one app",
          body: "Define collections in TypeScript. Get a full admin UI, typed API, and optimized delivery — all inside your Astro project.",
          ctaLabel: "Open admin",
          ctaHref: "/admin",
        },
        {
          type: "text",
          heading: "How it works",
          content: {
            type: "root",
            children: [
              {
                type: "paragraph",
                children: [
                  {
                    type: "text",
                    value:
                      "Define your collections in code. The generator produces Drizzle tables, TypeScript types, Zod validators, and a typed local API. The admin UI renders from your schema at runtime — add a field and it appears immediately.",
                  },
                ],
              },
            ],
          },
        },
        {
          type: "faq",
          heading: "Common questions",
          items: [
            {
              title: "Do I need a separate database server?",
              description:
                "No. Development uses SQLite with zero configuration. For production, you can switch to PostgreSQL.",
            },
            {
              title: "Can I use this with an existing Astro project?",
              description:
                "Yes. The CMS lives in src/cms/ and does not interfere with your existing pages, components, or integrations.",
            },
            {
              title: "How does caching work?",
              description:
                "Content pages are server-rendered and cached using Astro's route caching. When content changes, lifecycle hooks invalidate the relevant cache tags automatically.",
            },
            {
              title: "Is there vendor lock-in?",
              description:
                "No. The CMS runtime is editable project code, not an npm dependency. The database layer uses Drizzle ORM which works with any standard database.",
            },
          ],
        },
      ],
      _status: "published",
      _translations: [
        {
          locale: "fi",
          values: {
            blocks: [
              {
                type: "hero",
                eyebrow: "Astro-natiivi CMS",
                heading: "Sisältösi, koodisi, yksi sovellus",
                body: "Määrittele kokoelmat TypeScriptillä. Saat täyden hallintapaneelin, tyypitetyn rajapinnan ja optimoidun julkaisun — kaikki Astro-projektisi sisällä.",
                ctaLabel: "Avaa hallinta",
                ctaHref: "/admin",
              },
            ],
          },
        },
      ],
    },
  ],
};

export default seeds;
