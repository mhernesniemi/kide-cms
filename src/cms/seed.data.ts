import type { SeedDocument } from "./core/define";

const rt = (...children: any[]) => ({ type: "root", children });
const p = (text: string) => ({ type: "paragraph", children: [{ type: "text", value: text }] });
const h2 = (text: string) => ({ type: "heading", level: 2, children: [{ type: "text", value: text }] });
const h3 = (text: string) => ({ type: "heading", level: 3, children: [{ type: "text", value: text }] });
const li = (text: string) => ({
  type: "list-item",
  children: [{ type: "paragraph", children: [{ type: "text", value: text }] }],
});
const ul = (...items: string[]) => ({ type: "list", ordered: false, children: items.map(li) });
const quote = (text: string) => ({
  type: "quote",
  children: [{ type: "paragraph", children: [{ type: "text", value: text, italic: true }] }],
});

const seeds: Record<string, SeedDocument[]> = {
  authors: [
    {
      _id: "author_maya",
      name: "Maya Chen",
      slug: "maya-chen",
      title: "Editor in Chief",
      description: "Leads the editorial direction across product, design, and growth.",
      avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=800&q=80",
    },
    {
      _id: "author_leo",
      name: "Leo Marshall",
      slug: "leo-marshall",
      title: "Lead Developer",
      description: "Full-stack engineer with a focus on developer experience and content infrastructure.",
      avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=800&q=80",
    },
    {
      _id: "author_anna",
      name: "Anna Brooks",
      slug: "anna-brooks",
      title: "Design Lead",
      description: "Brings clarity to complex interfaces through systems thinking and user research.",
      avatar: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&w=800&q=80",
    },
    {
      _id: "author_eero",
      name: "James Webb",
      slug: "james-webb",
      title: "DevOps Engineer",
      description: "Infrastructure and deployment automation. Keeps things running smoothly.",
      avatar: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=800&q=80",
    },
  ],
  posts: [
    {
      title: "Getting Started with Kide CMS",
      slug: "getting-started-with-kide-cms",
      excerpt: "Everything you need to know to set up your first project with Kide CMS and start managing content.",
      body: rt(
        p(
          "Kide CMS is a code-first content management system built inside Astro. It takes a different approach from traditional CMSes: instead of configuring everything through a GUI, you define your content schema in TypeScript.",
        ),
        h2("Why code-first?"),
        p(
          "Code-first means your content model is version-controlled, reviewable in pull requests, and can be reasoned about by both humans and AI agents. There is no hidden configuration; everything is in your codebase.",
        ),
        h2("Quick setup"),
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
        h2("What you get"),
        ul(
          "A runtime admin UI with field editors, data tables, and preview",
          "Drafts, publishing, scheduling, and version history",
          "Internationalization with per-field translation tables",
          "Asset management with folders and focal point cropping",
          "Access control with role-based permissions",
        ),
      ),
      category: "technology",
      author: "author_leo",
      sortOrder: 50,
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
      body: rt(
        p(
          "A well-designed content model is the foundation of any CMS project. Get it right and adding features is straightforward. Get it wrong and you will be fighting your own schema.",
        ),
        h2("Start with the output"),
        p(
          "Before defining collections, sketch the pages you need to render. What content appears on each page? What is shared across pages? This tells you which fields belong on which collections, and where relations make sense.",
        ),
        h2("Keep it flat"),
        p(
          "Resist the urge to nest everything. A post with an author relation is simpler than a post with an embedded author object. Relations keep your data normalized and your queries predictable.",
        ),
        quote("The best content model is the one that makes the common case simple and the edge case possible."),
        h2("Use blocks for flexible layouts"),
        p(
          "When a page needs a mix of content types (hero sections, text blocks, FAQs), use the blocks field type. Each block type has its own schema, and editors can compose pages freely without developer intervention.",
        ),
      ),
      category: "design",
      author: "author_anna",
      sortOrder: 40,
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
      body: rt(
        p(
          "Most headless CMSes force you to fetch content over HTTP, even when the CMS and the frontend run in the same process. Kide CMS takes a different approach.",
        ),
        h2("Import, don't fetch"),
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
        h2("When HTTP is needed"),
        p(
          "The admin UI runs as React islands that need to talk to the server. For this, a thin HTTP layer wraps the same local API. But your public pages never go through HTTP; they call the API directly.",
        ),
        h2("Benefits"),
        ul(
          "Zero network overhead for server-rendered pages",
          "Full TypeScript types from schema to template",
          "Same API for admin and public, no duplication",
          "Easy to test with plain function calls",
        ),
      ),
      category: "technology",
      author: "author_leo",
      sortOrder: 30,
      _status: "published",
    },
    {
      title: "Deploying to Cloudflare",
      slug: "deploying-to-cloudflare",
      excerpt: "A step-by-step guide to deploying your Kide CMS site on Cloudflare Workers with D1 and R2.",
      body: rt(
        p(
          "Kide CMS supports Cloudflare Workers as a deployment target. This gives you edge rendering, a globally distributed database with D1, and asset storage with R2, all on Cloudflare's infrastructure.",
        ),
        h2("Prerequisites"),
        ul("A Cloudflare account", "Wrangler CLI installed", "A Kide CMS project created with the Cloudflare template"),
        h2("Setting up resources"),
        p(
          "The setup script creates a wrangler.toml with D1 and R2 bindings. You need to create these resources on Cloudflare and add their IDs to the config.",
        ),
        h2("Database migrations"),
        p(
          "Push your schema to the remote D1 database using the migration SQL file. This creates all the tables your collections need.",
        ),
        h2("Deploy"),
        {
          type: "paragraph",
          children: [
            { type: "text", value: "Run " },
            { type: "text", value: "pnpm run deploy", bold: true },
            {
              type: "text",
              value: " and your site is live on the edge. The admin panel works the same way; it's all one worker.",
            },
          ],
        },
      ),
      category: "technology",
      author: "author_eero",
      sortOrder: 20,
      _status: "published",
    },
    {
      title: "Building Custom Block Types",
      slug: "building-custom-block-types",
      excerpt: "How to create rich, composable page layouts with custom block components in Kide CMS.",
      body: rt(
        p(
          "Blocks are one of the most powerful features in Kide CMS. They let editors build flexible page layouts from predefined content types, while developers maintain full control over the rendering.",
        ),
        h2("Defining block types"),
        p(
          "Block types are defined in your collection config. Each type has its own set of fields: a hero block might have a heading, body text, and a CTA link, while an FAQ block has a list of question-answer pairs.",
        ),
        h2("Custom Astro components"),
        p(
          "Create an Astro component in src/components/blocks/ matching the block type name. The BlockRenderer automatically discovers and uses it. If no custom component exists, the built-in generic renderer handles it.",
        ),
        h3("Example: Hero block"),
        p(
          "A Hero.astro component receives the block's fields as props. You have full control over the markup, styles, and any additional logic like image optimization.",
        ),
        h2("Best practices"),
        ul(
          "Keep block types focused: one purpose per block",
          "Use text fields for short content, richText for long-form",
          "The JSON field with the repeater component works great for lists",
          "Test your blocks with the preview feature before publishing",
        ),
      ),
      category: "design",
      author: "author_anna",
      sortOrder: 10,
      _status: "published",
    },
    {
      title: "Access Control and Roles",
      slug: "access-control-and-roles",
      excerpt: "How to set up role-based permissions to control who can read, create, update, and publish content.",
      body: rt(
        p(
          "Kide CMS has a flexible access control system that lets you define rules per collection and per operation. Rules are plain functions that receive the current user and the document being accessed.",
        ),
        h2("Defining access rules"),
        p(
          "Access rules live in src/cms/access.ts. Each collection can have rules for read, create, update, delete, and publish operations. If no rule is defined, the operation is allowed by default.",
        ),
        h2("Role-based patterns"),
        p(
          "The most common pattern is checking the user's role. Editors might be allowed to create and update posts but not delete them. Admins have full access. Public users can only read published content.",
        ),
        quote(
          "Access control should be invisible when it's working. Users should only notice it when they try something they shouldn't.",
        ),
        h2("Field-level access"),
        p(
          "For fine-grained control, individual fields can have their own access rules. This is useful for sensitive fields like SEO metadata that only certain roles should edit.",
        ),
      ),
      category: "technology",
      author: "author_leo",
      sortOrder: 5,
      _status: "draft",
    },
  ],
  taxonomies: [
    {
      name: "Categories",
      slug: "categories",
      terms: [
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
      ],
    },
    {
      name: "Tags",
      slug: "tags",
      terms: [
        { id: "t6", name: "Astro", slug: "astro", children: [] },
        { id: "t7", name: "CMS", slug: "cms", children: [] },
        { id: "t8", name: "Open Source", slug: "open-source", children: [] },
        { id: "t12", name: "TypeScript", slug: "typescript", children: [] },
        { id: "t13", name: "Tutorial", slug: "tutorial", children: [] },
        { id: "t14", name: "Cloudflare", slug: "cloudflare", children: [] },
        { id: "t15", name: "Deployment", slug: "deployment", children: [] },
      ],
    },
  ],
  menus: [
    {
      name: "Main Navigation",
      slug: "main",
      items: [
        { id: "m1", label: "Home", href: "/", children: [] },
        { id: "m2", label: "Blog", href: "/blog", children: [
          { id: "m5", label: "Getting Started", href: "/blog/getting-started-with-kide-cms", children: [] },
          { id: "m6", label: "Deploying to Cloudflare", href: "/blog/deploying-to-cloudflare", children: [] },
          { id: "m7", label: "Building Block Types", href: "/blog/building-custom-block-types", children: [] },
        ] },
        { id: "m3", label: "About", href: "/about", children: [] },
        { id: "m4", label: "Features", href: "/features", children: [] },
      ],
    },
    {
      name: "Footer",
      slug: "footer",
      items: [
        { id: "f1", label: "Home", href: "/", children: [] },
        { id: "f2", label: "Blog", href: "/blog", children: [] },
        { id: "f3", label: "About", href: "/about", children: [] },
        {
          id: "f4",
          label: "GitHub",
          href: "https://github.com/mhernesniemi/kide-cms",
          target: "_blank",
          children: [],
        },
      ],
    },
  ],
  pages: [
    {
      title: "About",
      slug: "about",
      summary: "Learn more about Kide CMS and the ideas behind it.",
      blocks: [
        {
          type: "text",
          heading: "Built for developers who ship content sites",
          content: rt(
            p(
              "Most CMS platforms are either too simple for real projects or too complex to understand. Kide aims for the middle ground: enough structure to handle content-heavy sites, simple enough that one developer can understand the entire system.",
            ),
            p(
              "Everything is code. The schema is TypeScript. The admin renders from that schema. The API is generated from it. There is one source of truth and it lives in your repository.",
            ),
          ),
        },
        {
          type: "text",
          heading: "What makes Kide different",
          content: rt(
            p(
              "Kide CMS runs inside your Astro application: same process, same deployment. There is no separate API server to maintain, no external service to pay for, and no network hop between your CMS and your frontend.",
            ),
            p(
              "Your content schema is defined in TypeScript. From that single definition, the system generates database tables, TypeScript types, validation schemas, and a fully typed local API. Add a field to your config and it appears in the admin panel immediately.",
            ),
          ),
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
                "Kide runs inside your Astro app: same process, same deployment. No separate API server, no external database to manage in development. Relations return IDs, not auto-populated documents, so queries are always predictable.",
            },
            {
              title: "Is it production-ready?",
              description:
                "The core features are solid: collections, fields, admin UI, drafts, versioning, i18n, access control, and caching. It is actively developed and used in real projects.",
            },
            {
              title: "Can I deploy anywhere?",
              description:
                "Yes. Kide supports both Node.js (with SQLite) and Cloudflare Workers (with D1 and R2). The setup script lets you choose your deployment target.",
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
    {
      title: "Features",
      slug: "features",
      summary: "A closer look at what Kide CMS offers out of the box.",
      blocks: [
        {
          type: "text",
          heading: "Everything you need, nothing you don't",
          content: rt(
            p(
              "Kide CMS ships with a complete feature set for building content-driven websites. Every feature is designed to work together seamlessly while staying simple enough to understand and customize.",
            ),
          ),
        },
        {
          type: "faq",
          heading: "Core features",
          items: [
            {
              title: "Collections and fields",
              description:
                "Define any content structure with 13 field types: text, slug, email, number, boolean, date, select, richText, image, relation, array, json, and blocks.",
            },
            {
              title: "Admin panel",
              description:
                "A full-featured admin UI that renders from your schema. Includes data tables with sorting and search, inline editing, keyboard shortcuts, and dark mode.",
            },
            {
              title: "Drafts and publishing",
              description:
                "Save drafts without affecting the public site. Schedule content to publish and unpublish at specific times. Discard changes to revert to the published version.",
            },
            {
              title: "Version history",
              description: "Every save creates a version. Restore any previous version with one click.",
            },
            {
              title: "Internationalization",
              description:
                "Per-field translation support. Mark fields as translatable and manage translations side-by-side in the admin UI.",
            },
            {
              title: "Asset management",
              description:
                "Upload, organize, and optimize images. Folder organization, focal point cropping, and automatic format conversion.",
            },
            {
              title: "Access control",
              description:
                "Role-based permissions per collection and per operation. Field-level access rules for fine-grained control.",
            },
          ],
        },
      ],
      _status: "published",
    },
  ],
  "front-page": [
    {
      blocks: [
        {
          type: "hero",
          eyebrow: "Astro-native CMS",
          heading: "Your content, your code, one app",
          body: "Define collections in TypeScript. Get a full admin UI, typed API, and optimized delivery, all inside your Astro project.",
          ctaLabel: "Open admin",
          ctaHref: "/admin",
        },
        {
          type: "text",
          heading: "How it works",
          content: rt(
            p(
              "Define your collections in code. The generator produces Drizzle tables, TypeScript types, Zod validators, and a typed local API. The admin UI renders from your schema at runtime; add a field and it appears immediately.",
            ),
            p(
              "Your public pages query content through the typed local API. No HTTP overhead, no serialization, just plain function calls with full type safety.",
            ),
          ),
        },
        {
          type: "faq",
          heading: "Common questions",
          items: [
            {
              title: "Do I need a separate database server?",
              description:
                "No. Development uses SQLite with zero configuration. For Cloudflare deployment, it uses D1. No external databases to manage.",
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
            {
              title: "What deployment targets are supported?",
              description:
                "Node.js with SQLite for simple deployments, and Cloudflare Workers with D1 and R2 for edge deployment. The setup script handles the configuration.",
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
                body: "Määrittele kokoelmat TypeScriptillä. Saat täyden hallintapaneelin, tyypitetyn rajapinnan ja optimoidun julkaisun.kaikki Astro-projektisi sisällä.",
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
