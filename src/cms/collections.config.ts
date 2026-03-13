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
        password: fields.text({ required: true }),
      },
    }),
    defineCollection({
      slug: "authors",
      labels: { singular: "Author", plural: "Authors" },
      timestamps: true,
      fields: {
        name: fields.text({ required: true }),
        test: fields.text({ translatable: true }),
        description: fields.text({ translatable: true }),
        slug: fields.slug({ from: "name", unique: true }),
        role: fields.text({ required: true }),
        bio: fields.richText({ translatable: true }),
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
        body: fields.richText({ translatable: true, admin: { rows: 14 } }),
        cover: fields.image({
          admin: { placeholder: "/images/post-cover.jpg" },
        }),
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
    }),
  ],
});
