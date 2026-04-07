// auto-generated — do not edit
import type { RichTextDocument } from "@kide/core";

export type CMSCollectionSlug = "users" | "authors" | "posts" | "taxonomies" | "menus" | "front-page" | "pages";

export type UsersInput = {
  name: string;
  email: string;
  role?: "admin" | "editor" | "viewer";
  password?: string;
};

export type UsersTranslationInput = {
  [key: string]: never;
};

export type UsersDocument = UsersInput & {
  _id: string;
  _status: "draft" | "published" | "scheduled";
  _publishedAt?: string | null;
  _publishAt?: string | null;
  _unpublishAt?: string | null;
  _createdAt: string;
  _updatedAt: string;
  _locale?: string | null;
  _availableLocales?: string[];
};

export type AuthorsInput = {
  name: string;
  description?: string;
  slug?: string;
  title: string;
  avatar?: string;
};

export type AuthorsTranslationInput = {
  description?: string;
};

export type AuthorsDocument = AuthorsInput & {
  _id: string;
  _status: "draft" | "published" | "scheduled";
  _publishedAt?: string | null;
  _publishAt?: string | null;
  _unpublishAt?: string | null;
  _createdAt: string;
  _updatedAt: string;
  _locale?: string | null;
  _availableLocales?: string[];
};

export type PostsInput = {
  title: string;
  slug?: string;
  excerpt?: string;
  image?: string;
  body?: RichTextDocument;
  category?: string;
  author?: string;
  seoDescription?: string;
};

export type PostsTranslationInput = {
  title?: string;
  slug?: string;
  excerpt?: string;
  body?: RichTextDocument;
  seoDescription?: string;
};

export type PostsDocument = PostsInput & {
  _id: string;
  _status: "draft" | "published" | "scheduled";
  _publishedAt?: string | null;
  _publishAt?: string | null;
  _unpublishAt?: string | null;
  _createdAt: string;
  _updatedAt: string;
  _locale?: string | null;
  _availableLocales?: string[];
};

export type TaxonomiesInput = {
  name: string;
  slug?: string;
  terms?: Record<string, unknown>;
};

export type TaxonomiesTranslationInput = {
  terms?: Record<string, unknown>;
};

export type TaxonomiesDocument = TaxonomiesInput & {
  _id: string;
  _status: "draft" | "published" | "scheduled";
  _publishedAt?: string | null;
  _publishAt?: string | null;
  _unpublishAt?: string | null;
  _createdAt: string;
  _updatedAt: string;
  _locale?: string | null;
  _availableLocales?: string[];
};

export type MenusInput = {
  name: string;
  slug?: string;
  items?: Record<string, unknown>;
};

export type MenusTranslationInput = {
  items?: Record<string, unknown>;
};

export type MenusDocument = MenusInput & {
  _id: string;
  _status: "draft" | "published" | "scheduled";
  _publishedAt?: string | null;
  _publishAt?: string | null;
  _unpublishAt?: string | null;
  _createdAt: string;
  _updatedAt: string;
  _locale?: string | null;
  _availableLocales?: string[];
};

export type FrontPageInput = {
  blocks?: Array<{ type: "hero"; eyebrow?: string; heading: string; body?: string; ctaLabel?: string; ctaHref?: string; } | { type: "text"; heading?: string; content?: RichTextDocument; } | { type: "faq"; heading?: string; items?: Record<string, unknown>; }>;
};

export type FrontPageTranslationInput = {
  blocks?: Array<{ type: "hero"; eyebrow?: string; heading: string; body?: string; ctaLabel?: string; ctaHref?: string; } | { type: "text"; heading?: string; content?: RichTextDocument; } | { type: "faq"; heading?: string; items?: Record<string, unknown>; }>;
};

export type FrontPageDocument = FrontPageInput & {
  _id: string;
  _status: "draft" | "published" | "scheduled";
  _publishedAt?: string | null;
  _publishAt?: string | null;
  _unpublishAt?: string | null;
  _createdAt: string;
  _updatedAt: string;
  _locale?: string | null;
  _availableLocales?: string[];
};

export type PagesInput = {
  title: string;
  slug?: string;
  summary?: string;
  image?: string;
  relatedPosts?: string[];
  seoDescription?: string;
  blocks?: Array<{ type: "text"; heading?: string; content?: RichTextDocument; } | { type: "image"; images?: string[]; } | { type: "faq"; heading?: string; items?: Record<string, unknown>; }>;
};

export type PagesTranslationInput = {
  title?: string;
  slug?: string;
  summary?: string;
  seoDescription?: string;
  blocks?: Array<{ type: "text"; heading?: string; content?: RichTextDocument; } | { type: "image"; images?: string[]; } | { type: "faq"; heading?: string; items?: Record<string, unknown>; }>;
};

export type PagesDocument = PagesInput & {
  _id: string;
  _status: "draft" | "published" | "scheduled";
  _publishedAt?: string | null;
  _publishAt?: string | null;
  _unpublishAt?: string | null;
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