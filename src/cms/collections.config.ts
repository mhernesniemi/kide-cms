import { defineCollection, defineConfig, fields } from "./core/define";

export default defineConfig({
  database: { dialect: "sqlite" },
  locales: {
    default: "en",
    supported: ["en", "fi"],
  },
  collections: [
    defineCollection({
      slug: "users",
      labels: { singular: "User", plural: "Users" },
      auth: true,
      timestamps: true,
      fields: {
        email: fields.email({ required: true, unique: true }),
        name: fields.text({ required: true }),
        role: fields.select({
          options: ["admin", "editor", "viewer"],
          defaultValue: "editor",
        }),
        password: fields.text({ required: true, admin: { hidden: true } }),
      },
    }),
    defineCollection({
      slug: "authors",
      labels: { singular: "Author", plural: "Authors" },
      labelField: "name",
      timestamps: true,
      fields: {
        name: fields.text({ required: true }),
        description: fields.text({ translatable: true }),
        slug: fields.slug({ from: "name", unique: true }),
        title: fields.text({ required: true }),
        avatar: fields.image({
          admin: { placeholder: "https://images.example.com/avatar.jpg" },
        }),
      },
    }),
    defineCollection({
      slug: "posts",
      labels: { singular: "Post", plural: "Posts" },
      pathPrefix: "blog",
      timestamps: true,
      drafts: true,
      versions: { max: 20 },
      fields: {
        title: fields.text({
          required: true,
          indexed: true,
          translatable: true,
        }),
        slug: fields.slug({ from: "title", unique: true, translatable: true }),
        excerpt: fields.text({
          maxLength: 300,
          translatable: true,
          admin: { rows: 3 },
        }),
        image: fields.image(),
        body: fields.richText({ translatable: true, admin: { rows: 14 } }),
        category: fields.text({
          admin: { component: "taxonomy-select", placeholder: "categories" },
        }),
        author: fields.relation({ collection: "authors" }),
        postType: fields.select({
          options: ["article", "video", "podcast"],
          defaultValue: "article",
          admin: { component: "radio" },
        }),
        videoUrl: fields.text({
          label: "Video URL",
          condition: { field: "postType", value: "video" },
        }),
        podcastUrl: fields.text({
          label: "Podcast URL",
          condition: { field: "postType", value: "podcast" },
        }),
        seoDescription: fields.text({
          maxLength: 160,
          translatable: true,
          admin: { rows: 3, help: "Meta description for search engines. Max 160 characters." },
        }),
      },
    }),
    defineCollection({
      slug: "taxonomies",
      labels: { singular: "Taxonomy", plural: "Taxonomies" },
      timestamps: true,
      fields: {
        name: fields.text({ required: true }),
        slug: fields.slug({ from: "name", unique: true }),
        terms: fields.json({
          defaultValue: {} as any,
          translatable: true,
          admin: { component: "taxonomy-terms" },
        }),
      },
    }),
    defineCollection({
      slug: "menus",
      labels: { singular: "Menu", plural: "Menus" },
      timestamps: true,
      fields: {
        name: fields.text({ required: true }),
        slug: fields.slug({ from: "name", unique: true }),
        items: fields.json({
          defaultValue: {} as any,
          translatable: true,
          admin: { component: "menu-items" },
        }),
      },
    }),
    defineCollection({
      slug: "front-page",
      labels: { singular: "Front Page", plural: "Front Page" },
      singleton: true,
      timestamps: true,
      drafts: true,
      fields: {
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
            faq: {
              heading: fields.text(),
              items: fields.json({
                defaultValue: [] as any,
                admin: { component: "repeater", help: "Add question and answer pairs" },
              }),
            },
          },
        }),
      },
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
        image: fields.image(),
        layout: fields.select({
          options: ["default", "landing", "docs"],
          defaultValue: "landing",
        }),
        relatedPosts: fields.relation({ collection: "posts", hasMany: true }),
        seoDescription: fields.text({
          maxLength: 160,
          translatable: true,
          admin: { rows: 3, help: "Meta description for search engines. Max 160 characters." },
        }),
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
            faq: {
              heading: fields.text(),
              items: fields.json({
                defaultValue: [] as any,
                admin: { component: "repeater", help: "Add question and answer pairs" },
              }),
            },
          },
        }),
      },
    }),
  ],
});
