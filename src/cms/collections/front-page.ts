import { defineCollection, fields, hasRole } from "@kidecms/core";

export default defineCollection({
  slug: "front-page",
  labels: { singular: "Front Page", plural: "Front Page" },
  singleton: true,
  preview: "/",
  timestamps: true,
  drafts: true,
  access: {
    publish: hasRole("admin"),
  },
  fields: {
    seoDescription: fields.text({
      maxLength: 160,
      translatable: true,
      admin: {
        rows: 3,
        help: "Meta description for search engines. Max 160 characters.",
        position: "sidebar",
      },
    }),
    // Consecutive fields sharing an admin.group render as one titled panel.
    introHeading: fields.text({
      translatable: true,
      label: "Heading",
      admin: { group: "Intro" },
    }),
    introText: fields.text({
      translatable: true,
      label: "Text",
      admin: { group: "Intro", rows: 2 },
    }),

    featuredHeading: fields.text({
      translatable: true,
      label: "Heading",
      admin: { group: { label: "Featured posts", collapsible: true } },
    }),
    featuredPosts: fields.relation({
      collection: "posts",
      hasMany: true,
      maxItems: 4,
      label: "Posts",
      admin: {
        group: { label: "Featured posts", collapsible: true },
        help: "Hand-picked posts, up to four — drag the selected rows to reorder.",
      },
    }),

    promoText: fields.text({
      translatable: true,
      label: "Text",
      admin: { group: { label: "Promo banner", collapsible: "collapsed" }, rows: 2 },
    }),
    promoLink: fields.link({
      translatable: true,
      label: "Link",
      admin: { group: { label: "Promo banner", collapsible: "collapsed" } },
    }),

    blocks: fields.blocks({
      translatable: true,
      types: {
        hero: {
          eyebrow: fields.text(),
          heading: fields.text({ required: true }),
          body: fields.text(),
          ctaLabel: fields.text(),
          ctaHref: fields.relation({ collection: "pages" }),
        },
        text: {
          heading: fields.text(),
          content: fields.richText(),
        },
        youtube: {
          url: fields.text({ required: true, admin: { component: "youtube", placeholder: "Paste a YouTube URL" } }),
        },
        faq: {
          heading: fields.text(),
          items: fields.json({
            admin: { component: "repeater", help: "Add question and answer pairs" },
          }),
        },
      },
    }),
  },
});
