// auto-generated — do not edit
import { z } from "zod";

export const UsersCreateSchema = z.object({
  email: z.string().email(),
  name: z.string(),
  role: z.enum(["admin", "editor", "viewer"]).optional(),
  password: z.string(),
});

export const UsersUpdateSchema = z.object({
  email: z.string().email().optional(),
  name: z.string().optional(),
  role: z.enum(["admin", "editor", "viewer"]).optional(),
  password: z.string().optional(),
});

export const AuthorsCreateSchema = z.object({
  name: z.string(),
  test: z.string().optional(),
  description: z.string().optional(),
  slug: z.string().optional(),
  role: z.string(),
  bio: z.object({ type: z.literal("root"), children: z.array(z.any()) }).optional(),
  avatar: z.string().optional(),
});

export const AuthorsUpdateSchema = z.object({
  name: z.string().optional(),
  test: z.string().optional(),
  description: z.string().optional(),
  slug: z.string().optional(),
  role: z.string().optional(),
  bio: z.object({ type: z.literal("root"), children: z.array(z.any()) }).optional(),
  avatar: z.string().optional(),
});

export const PostsCreateSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  slug: z.string().optional(),
  excerpt: z.string().max(300).optional(),
  body: z.object({ type: z.literal("root"), children: z.array(z.any()) }).optional(),
  cover: z.string().optional(),
  category: z.enum(["Product", "Design", "Engineering", "Business"]).optional(),
  author: z.string().optional(),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
  sortOrder: z.number().optional(),
});

export const PostsUpdateSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  slug: z.string().optional(),
  excerpt: z.string().max(300).optional(),
  body: z.object({ type: z.literal("root"), children: z.array(z.any()) }).optional(),
  cover: z.string().optional(),
  category: z.enum(["Product", "Design", "Engineering", "Business"]).optional(),
  author: z.string().optional(),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
  sortOrder: z.number().optional(),
});

export const PagesCreateSchema = z.object({
  title: z.string(),
  slug: z.string().optional(),
  summary: z.string().optional(),
  layout: z.enum(["default", "landing", "docs"]).optional(),
  heroImage: z.string().optional(),
  blocks: z
    .array(
      z.discriminatedUnion("type", [
        z.object({
          type: z.literal("hero"),
          eyebrow: z.string().optional(),
          heading: z.string(),
          body: z.string().optional(),
          ctaLabel: z.string().optional(),
          ctaHref: z.string().optional(),
        }),
        z.object({
          type: z.literal("text"),
          heading: z.string().optional(),
          content: z.object({ type: z.literal("root"), children: z.array(z.any()) }).optional(),
        }),
        z.object({ type: z.literal("gallery"), images: z.array(z.string()).optional() }),
      ]),
    )
    .optional(),
});

export const PagesUpdateSchema = z.object({
  title: z.string().optional(),
  slug: z.string().optional(),
  summary: z.string().optional(),
  layout: z.enum(["default", "landing", "docs"]).optional(),
  heroImage: z.string().optional(),
  blocks: z
    .array(
      z.discriminatedUnion("type", [
        z.object({
          type: z.literal("hero"),
          eyebrow: z.string().optional(),
          heading: z.string(),
          body: z.string().optional(),
          ctaLabel: z.string().optional(),
          ctaHref: z.string().optional(),
        }),
        z.object({
          type: z.literal("text"),
          heading: z.string().optional(),
          content: z.object({ type: z.literal("root"), children: z.array(z.any()) }).optional(),
        }),
        z.object({ type: z.literal("gallery"), images: z.array(z.string()).optional() }),
      ]),
    )
    .optional(),
});

export const validators = {
  users: { create: UsersCreateSchema, update: UsersUpdateSchema },
  authors: { create: AuthorsCreateSchema, update: AuthorsUpdateSchema },
  posts: { create: PostsCreateSchema, update: PostsUpdateSchema },
  pages: { create: PagesCreateSchema, update: PagesUpdateSchema },
};
