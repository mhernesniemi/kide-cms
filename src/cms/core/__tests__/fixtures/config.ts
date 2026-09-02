/**
 * Self-contained test schema — a rich content model (auth, relations, drafts,
 * versions, hooks, field-level access) that core tests run against regardless
 * of what the template's own userland collections look like.
 *
 * The generated Drizzle schema lives in ./project/src/cms/.generated/ and is
 * committed; regenerate with `pnpm test:fixtures` after generator changes.
 */
import { contentToPlainText, defineCollection, defineConfig, fields, hasRole } from "@kidecms/core";

const users = defineCollection({
  slug: "users",
  labels: { singular: "User", plural: "Users" },
  auth: true,
  timestamps: true,
  fields: {
    name: fields.text({ required: true }),
    email: fields.email({ required: true, unique: true }),
    role: fields.select({ options: ["admin", "editor"], defaultValue: "editor" }),
    password: fields.text({ admin: { hidden: true } }),
  },
});

const authors = defineCollection({
  slug: "authors",
  labels: { singular: "Author", plural: "Authors" },
  labelField: "name",
  timestamps: true,
  fields: {
    name: fields.text({ required: true }),
    description: fields.text({ translatable: true }),
    slug: fields.slug({ from: "name" }),
    title: fields.text(),
    avatar: fields.image(),
  },
});

const posts = defineCollection({
  slug: "posts",
  labels: { singular: "Post", plural: "Posts" },
  pathPrefix: "blog",
  timestamps: true,
  drafts: true,
  searchable: true,
  versions: { max: 20 },
  fields: {
    title: fields.text({ required: true, translatable: true }),
    slug: fields.slug({ from: "title", translatable: true }),
    excerpt: fields.text({ maxLength: 300, translatable: true }),
    image: fields.image(),
    body: fields.content({
      translatable: true,
      blocks: {
        faq: {
          heading: fields.text(),
          items: fields.json({ admin: { component: "repeater" } }),
        },
        youtube: {
          url: fields.text({ required: true, admin: { component: "youtube" } }),
        },
      },
    }),
    category: fields.text({ admin: { component: "taxonomy-select", placeholder: "categories" } }),
    author: fields.relation({ collection: "authors" }),
    seoDescription: fields.text({ maxLength: 160, translatable: true }),
    listed: fields.boolean({ translatable: true, defaultValue: false }),
  },
  hooks: {
    beforeCreate(data) {
      if (!data.excerpt && typeof data.body === "object" && data.body) {
        const text = contentToPlainText(data.body as never);
        if (text) data.excerpt = text.slice(0, 180);
      }
      return data;
    },
    afterPublish(doc, context) {
      context.cache?.invalidate({ tags: ["posts", "home", `post:${doc._id}`] });
    },
    afterUpdate(doc, context) {
      context.cache?.invalidate({ tags: ["posts", `post:${doc._id}`] });
    },
    afterDelete(doc, context) {
      context.cache?.invalidate({ tags: ["posts", "home", `post:${doc._id}`] });
    },
  },
});

const pages = defineCollection({
  slug: "pages",
  labels: { singular: "Page", plural: "Pages" },
  preview: true,
  timestamps: true,
  drafts: true,
  searchable: true,
  versions: { max: 20 },
  fields: {
    title: fields.text({ required: true, translatable: true }),
    slug: fields.slug({ from: "title", translatable: true }),
    summary: fields.text({
      translatable: true,
      access: { read: hasRole("admin") },
    }),
    image: fields.image(),
    relatedPosts: fields.relation({ collection: "posts", hasMany: true }),
    seoDescription: fields.text({
      maxLength: 160,
      translatable: true,
      access: { update: hasRole("admin") },
    }),
    blocks: fields.blocks({
      translatable: true,
      types: {
        text: {
          heading: fields.text(),
          content: fields.richText(),
        },
      },
    }),
  },
  hooks: {
    afterPublish(doc, context) {
      context.cache?.invalidate({ tags: ["pages", "home", `page:${doc._id}`] });
    },
    afterUpdate(doc, context) {
      context.cache?.invalidate({ tags: ["pages", `page:${doc._id}`] });
    },
    afterDelete(doc, context) {
      context.cache?.invalidate({ tags: ["pages", "home", `page:${doc._id}`] });
    },
  },
});

export default defineConfig({
  locales: {
    default: "en",
    supported: ["en", "fi"],
  },
  collections: [users, authors, posts, pages],
});
