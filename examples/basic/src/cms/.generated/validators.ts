// auto-generated — do not edit
import { z } from "zod";

export const UsersCreateSchema = z.object({
  name: z.string(),
  email: z.string().email(),
  role: z.enum(["admin", "editor", "viewer"]).optional(),
  password: z.string().optional(),
});

export const UsersUpdateSchema = z.object({
  name: z.string().optional(),
  email: z.string().email().optional(),
  role: z.enum(["admin", "editor", "viewer"]).optional(),
  password: z.string().optional(),
});

export const AuthorsCreateSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  slug: z.string().optional(),
  title: z.string(),
  avatar: z.string().optional(),
});

export const AuthorsUpdateSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  slug: z.string().optional(),
  title: z.string().optional(),
  avatar: z.string().optional(),
});

export const PostsCreateSchema = z.object({
  title: z.string(),
  slug: z.string().optional(),
  excerpt: z.string().max(300).optional(),
  image: z.string().optional(),
  body: z.object({ type: z.literal('root'), children: z.array(z.any()) }).optional(),
  category: z.string().optional(),
  author: z.string().optional(),
  seoDescription: z.string().max(160).optional(),
});

export const PostsUpdateSchema = z.object({
  title: z.string().optional(),
  slug: z.string().optional(),
  excerpt: z.string().max(300).optional(),
  image: z.string().optional(),
  body: z.object({ type: z.literal('root'), children: z.array(z.any()) }).optional(),
  category: z.string().optional(),
  author: z.string().optional(),
  seoDescription: z.string().max(160).optional(),
});

export const TaxonomiesCreateSchema = z.object({
  name: z.string(),
  slug: z.string().optional(),
  terms: z.record(z.unknown()).optional(),
});

export const TaxonomiesUpdateSchema = z.object({
  name: z.string().optional(),
  slug: z.string().optional(),
  terms: z.record(z.unknown()).optional(),
});

export const MenusCreateSchema = z.object({
  name: z.string(),
  slug: z.string().optional(),
  items: z.record(z.unknown()).optional(),
});

export const MenusUpdateSchema = z.object({
  name: z.string().optional(),
  slug: z.string().optional(),
  items: z.record(z.unknown()).optional(),
});

export const FrontPageCreateSchema = z.object({
  blocks: z.array(z.discriminatedUnion("type", [
    z.object({ type: z.literal("hero"), eyebrow: z.string().optional(), heading: z.string(), body: z.string().optional(), ctaLabel: z.string().optional(), ctaHref: z.string().optional() }),
    z.object({ type: z.literal("text"), heading: z.string().optional(), content: z.object({ type: z.literal('root'), children: z.array(z.any()) }).optional() }),
    z.object({ type: z.literal("faq"), heading: z.string().optional(), items: z.record(z.unknown()).optional() }),
  ])).optional(),
});

export const FrontPageUpdateSchema = z.object({
  blocks: z.array(z.discriminatedUnion("type", [
    z.object({ type: z.literal("hero"), eyebrow: z.string().optional(), heading: z.string(), body: z.string().optional(), ctaLabel: z.string().optional(), ctaHref: z.string().optional() }),
    z.object({ type: z.literal("text"), heading: z.string().optional(), content: z.object({ type: z.literal('root'), children: z.array(z.any()) }).optional() }),
    z.object({ type: z.literal("faq"), heading: z.string().optional(), items: z.record(z.unknown()).optional() }),
  ])).optional(),
});

export const PagesCreateSchema = z.object({
  title: z.string(),
  slug: z.string().optional(),
  summary: z.string().optional(),
  image: z.string().optional(),
  relatedPosts: z.array(z.string()).optional(),
  seoDescription: z.string().max(160).optional(),
  blocks: z.array(z.discriminatedUnion("type", [
    z.object({ type: z.literal("text"), heading: z.string().optional(), content: z.object({ type: z.literal('root'), children: z.array(z.any()) }).optional() }),
    z.object({ type: z.literal("image"), images: z.array(z.string()).optional() }),
    z.object({ type: z.literal("faq"), heading: z.string().optional(), items: z.record(z.unknown()).optional() }),
  ])).optional(),
});

export const PagesUpdateSchema = z.object({
  title: z.string().optional(),
  slug: z.string().optional(),
  summary: z.string().optional(),
  image: z.string().optional(),
  relatedPosts: z.array(z.string()).optional(),
  seoDescription: z.string().max(160).optional(),
  blocks: z.array(z.discriminatedUnion("type", [
    z.object({ type: z.literal("text"), heading: z.string().optional(), content: z.object({ type: z.literal('root'), children: z.array(z.any()) }).optional() }),
    z.object({ type: z.literal("image"), images: z.array(z.string()).optional() }),
    z.object({ type: z.literal("faq"), heading: z.string().optional(), items: z.record(z.unknown()).optional() }),
  ])).optional(),
});

export const validators = {
  users: { create: UsersCreateSchema, update: UsersUpdateSchema },
  authors: { create: AuthorsCreateSchema, update: AuthorsUpdateSchema },
  posts: { create: PostsCreateSchema, update: PostsUpdateSchema },
  taxonomies: { create: TaxonomiesCreateSchema, update: TaxonomiesUpdateSchema },
  menus: { create: MenusCreateSchema, update: MenusUpdateSchema },
  front-page: { create: FrontPageCreateSchema, update: FrontPageUpdateSchema },
  pages: { create: PagesCreateSchema, update: PagesUpdateSchema },
};