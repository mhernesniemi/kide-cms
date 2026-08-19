import type { SeedDocument } from "@kidecms/core";

const rt = (...children: any[]) => ({ type: "root", children });
const p = (text: string) => ({ type: "paragraph", children: [{ type: "text", value: text }] });
const h2 = (text: string) => ({ type: "heading", level: 2, children: [{ type: "text", value: text }] });
const li = (text: string) => ({
  type: "list-item",
  children: [{ type: "paragraph", children: [{ type: "text", value: text }] }],
});
const ul = (...items: string[]) => ({ type: "list", ordered: false, children: items.map(li) });
const block = (blockType: string, blockFields: Record<string, unknown>) => ({
  type: "block",
  blockType,
  fields: blockFields,
});

const seeds: Record<string, SeedDocument[]> = {
  "front-page": [
    {
      seoDescription: "Acme helps small teams launch faster with less overhead.",
      blocks: [
        {
          type: "hero",
          heading: "Launch faster, grow smarter",
          body: "Everything your team needs to plan, build, and ship — in one place, without the busywork.",
          cta: { type: "internal", url: "/contact", label: "Get in touch" },
        },
        {
          type: "features",
          heading: "Why teams choose Acme",
          items: [
            {
              title: "Set up in minutes",
              description: "Start from a template and go live the same day. No consultants, no six-week onboarding.",
            },
            {
              title: "Built to scale",
              description: "From a two-person startup to a hundred-person team, the same workspace grows with you.",
            },
            {
              title: "Own your data",
              description: "Export everything at any time. Your content and your customers stay yours.",
            },
          ],
        },
        {
          type: "faq",
          heading: "Frequently asked questions",
          items: [
            {
              title: "Is there a free trial?",
              description: "Yes — every plan starts with a 14-day trial. No credit card required.",
            },
            {
              title: "Can I cancel any time?",
              description: "Plans are month-to-month. Cancel whenever you like and keep access until the period ends.",
            },
            {
              title: "Do you offer support?",
              description: "Email support is included on all plans, with same-day responses on business days.",
            },
          ],
        },
        {
          type: "cta",
          heading: "Ready to get started?",
          body: "Tell us about your project and we will get back to you within one business day.",
          buttonLabel: "Contact us",
          buttonHref: "/contact",
        },
      ],
      _status: "published",
    },
  ],
  pages: [
    {
      title: "About",
      slug: "about",
      seoDescription: "Who we are and why we build Acme.",
      body: rt(
        h2("Built by a small team that ships"),
        p(
          "Acme started in 2020 when three colleagues got tired of stitching together five tools to run one project. We decided to build the workspace we wished existed: fast, focused, and honest about what it does.",
        ),
        p(
          "Today Acme is used by hundreds of teams, and we are still small on purpose. Small teams talk to their customers, ship weekly, and say no to features that add noise.",
        ),
        h2("What we believe"),
        ul(
          "Software should save time, not demand it",
          "Pricing should be simple enough to fit in one sentence",
          "Your data belongs to you, exportable at any moment",
          "Support is a feature, not a cost center",
        ),
        block("cta", {
          heading: "Want to know more?",
          body: "We are happy to answer questions about the product, the team, or the roadmap.",
          buttonLabel: "Contact us",
          buttonHref: "/contact",
        }),
      ),
      _status: "published",
    },
  ],
  posts: [
    {
      title: "Announcing the Acme Spring Release",
      slug: "announcing-the-acme-spring-release",
      excerpt: "Faster dashboards, a redesigned editor, and the most requested feature of the year: saved views.",
      body: rt(
        p(
          "Our spring release is here, and it is the biggest update since launch. Every improvement in this release came directly from customer conversations.",
        ),
        h2("Saved views"),
        p(
          "You can now save any filtered board or list as a named view and share it with your team. Views update live, so a shared pipeline or sprint board always shows the current state.",
        ),
        h2("A faster, cleaner editor"),
        p(
          "The document editor was rebuilt from the ground up. It loads in half the time, autosaves more predictably, and finally supports drag-and-drop images.",
        ),
        h2("What's next"),
        p(
          "Next quarter we are focusing on integrations and a public API. If there is a tool you want Acme to talk to, tell us through the contact form.",
        ),
      ),
      category: "news",
      _status: "published",
    },
    {
      title: "Five Habits of Teams That Ship Every Week",
      slug: "five-habits-of-teams-that-ship-every-week",
      excerpt:
        "Weekly shipping is less about heroics and more about removing friction. Here is what the best teams do differently.",
      body: rt(
        p(
          "We work with hundreds of product teams, and the ones that ship weekly share a handful of habits. None of them are complicated — they are just practiced consistently.",
        ),
        h2("Keep the backlog short"),
        p(
          "High-velocity teams treat the backlog as a menu, not an archive. If an idea has not been touched in three months, it gets deleted. A short backlog keeps planning meetings short too.",
        ),
        h2("Write down decisions"),
        p(
          "A two-line decision note saves an hour of re-litigating next month. Where the note lives matters less than the habit of writing it.",
        ),
        h2("Demo on Fridays"),
        ul(
          "Demos create a natural weekly deadline",
          "Showing unfinished work early kills bad ideas cheaply",
          "Everyone sees what everyone else is building",
        ),
        p("Start with one habit, practice it for a month, then add the next. Consistency beats intensity."),
      ),
      category: "guides",
      _status: "published",
    },
    {
      title: "How Northwind Cut Onboarding Time in Half",
      slug: "how-northwind-cut-onboarding-time-in-half",
      excerpt: "A look at how a 40-person agency moved their client onboarding into Acme and what changed.",
      body: rt(
        p(
          "Northwind is a 40-person design agency that onboards three to five new clients every month. Before Acme, each onboarding lived in a patchwork of spreadsheets, email threads, and shared drives.",
        ),
        h2("The problem"),
        p(
          "Every project manager ran onboarding slightly differently. Steps were missed, clients asked the same questions twice, and nobody could say at a glance how far along a new client was.",
        ),
        h2("The change"),
        p(
          "Northwind built a single onboarding template in Acme: one checklist, one timeline, one place for client documents. New projects start from the template, so every client gets the same experience.",
        ),
        h2("The result"),
        p(
          "Average onboarding time dropped from four weeks to under two. Just as importantly, client-facing surprises dropped to nearly zero — everyone can see the same status at any time.",
        ),
      ),
      category: "customers",
      _status: "published",
    },
  ],
  taxonomies: [
    {
      name: "Categories",
      slug: "categories",
      terms: [
        { id: "t1", name: "News", slug: "news", children: [] },
        { id: "t2", name: "Guides", slug: "guides", children: [] },
        { id: "t3", name: "Customers", slug: "customers", children: [] },
      ],
    },
  ],
  menus: [
    {
      name: "Main Navigation",
      slug: "main",
      items: [
        { id: "m1", label: "Home", href: "/", children: [] },
        { id: "m2", label: "About", href: "/about", children: [] },
        { id: "m3", label: "Blog", href: "/blog", children: [] },
        { id: "m4", label: "Contact", href: "/contact", children: [] },
      ],
    },
  ],
  forms: [
    {
      title: "Contact",
      slug: "contact",
      successMessage: "Thanks — we got your message. We will reply within one business day.",
      fields: [
        { type: "text", name: "name", label: "Name", placeholder: "Your name", required: true },
        { type: "email", name: "email", label: "Email", placeholder: "you@example.com", required: true },
        {
          type: "textarea",
          name: "message",
          label: "Message",
          placeholder: "How can we help?",
          rows: 5,
          required: true,
        },
      ],
    },
  ],
};

export default seeds;
