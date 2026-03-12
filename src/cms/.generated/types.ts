// auto-generated — do not edit
import type { RichTextDocument } from "../core/define";

export type CMSCollectionSlug = "users" | "authors" | "posts" | "pages";

export type UsersInput = {
  email: string;
  name: string;
  role?: "admin" | "editor" | "viewer";
  password: string;
};

export type UsersTranslationInput = {
  [key: string]: never;
};

export type UsersDocument = UsersInput & {
  _id: string;
  _status: "draft" | "published";
  _createdAt: string;
  _updatedAt: string;
  _locale?: string | null;
  _availableLocales?: string[];
};

export type AuthorsInput = {
  name: string;
  slug?: string;
  role: string;
  bio?: RichTextDocument;
  avatar?: string;
};

export type AuthorsTranslationInput = {
  bio?: RichTextDocument;
};

export type AuthorsDocument = AuthorsInput & {
  _id: string;
  _status: "draft" | "published";
  _createdAt: string;
  _updatedAt: string;
  _locale?: string | null;
  _availableLocales?: string[];
};

export type PostsInput = {
  title: string;
  slug?: string;
  excerpt?: string;
  body?: RichTextDocument;
  cover?: string;
  category?: "Product" | "Design" | "Engineering" | "Business";
  author?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
  sortOrder?: number;
};

export type PostsTranslationInput = {
  title?: string;
  slug?: string;
  excerpt?: string;
  body?: RichTextDocument;
};

export type PostsDocument = PostsInput & {
  _id: string;
  _status: "draft" | "published";
  _createdAt: string;
  _updatedAt: string;
  _locale?: string | null;
  _availableLocales?: string[];
};

export type PagesInput = {
  title: string;
  slug?: string;
  summary?: string;
  layout?: "default" | "landing" | "docs";
  heroImage?: string;
  blocks?: Array<{ type: "hero"; eyebrow?: string; heading: string; body?: string; ctaLabel?: string; ctaHref?: string; } | { type: "text"; heading?: string; content?: RichTextDocument; } | { type: "gallery"; images?: string[]; }>;
};

export type PagesTranslationInput = {
  title?: string;
  slug?: string;
  summary?: string;
  blocks?: Array<{ type: "hero"; eyebrow?: string; heading: string; body?: string; ctaLabel?: string; ctaHref?: string; } | { type: "text"; heading?: string; content?: RichTextDocument; } | { type: "gallery"; images?: string[]; }>;
};

export type PagesDocument = PagesInput & {
  _id: string;
  _status: "draft" | "published";
  _createdAt: string;
  _updatedAt: string;
  _locale?: string | null;
  _availableLocales?: string[];
};

export type StoredVersion = {
  version: number;
  createdAt: string;
  snapshot: Record<string, unknown>;
};