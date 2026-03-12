// auto-generated — do not edit
import access from "../access";
import config from "../collections.config";
import { createCms } from "../core/api";
import { seedDatabase } from "../core/seed";
import hooks from "../hooks";
import type {
  UsersDocument,
  UsersInput,
  UsersTranslationInput,
  AuthorsDocument,
  AuthorsInput,
  AuthorsTranslationInput,
  PostsDocument,
  PostsInput,
  PostsTranslationInput,
  PagesDocument,
  PagesInput,
  PagesTranslationInput,
} from "./types";

export const cms = createCms(config, access, hooks) as ReturnType<typeof createCms> & {
  users: {
    find(
      options?: import("../core/api").FindOptions,
      context?: { user?: { id: string; role?: string; email?: string } | null },
    ): Promise<UsersDocument[]>;
    findOne(
      filter: Record<string, unknown> & { locale?: string; status?: "draft" | "published" | "any" },
      context?: { user?: { id: string; role?: string; email?: string } | null },
    ): Promise<UsersDocument | null>;
    findById(
      id: string,
      options?: { locale?: string; status?: "draft" | "published" | "any" },
      context?: { user?: { id: string; role?: string; email?: string } | null },
    ): Promise<UsersDocument | null>;
    create(
      data: UsersInput,
      context?: { user?: { id: string; role?: string; email?: string } | null },
    ): Promise<UsersDocument>;
    update(
      id: string,
      data: Partial<UsersInput>,
      context?: { user?: { id: string; role?: string; email?: string } | null },
    ): Promise<UsersDocument>;
    delete(id: string, context?: { user?: { id: string; role?: string; email?: string } | null }): Promise<void>;
    count(
      filter?: Omit<import("../core/api").FindOptions, "limit" | "offset" | "sort">,
      context?: { user?: { id: string; role?: string; email?: string } | null },
    ): Promise<number>;
    versions(id: string): Promise<import("./types").StoredVersion[]>;
    restore(
      id: string,
      versionNumber: number,
      context?: { user?: { id: string; role?: string; email?: string } | null },
    ): Promise<UsersDocument>;
    publish(
      id: string,
      context?: { user?: { id: string; role?: string; email?: string } | null },
    ): Promise<UsersDocument>;
    unpublish(
      id: string,
      context?: { user?: { id: string; role?: string; email?: string } | null },
    ): Promise<UsersDocument>;
    getTranslations(id: string): Promise<Record<string, UsersTranslationInput>>;
    upsertTranslation(
      id: string,
      locale: string,
      data: UsersTranslationInput,
      context?: { user?: { id: string; role?: string; email?: string } | null },
    ): Promise<UsersDocument>;
  };
  authors: {
    find(
      options?: import("../core/api").FindOptions,
      context?: { user?: { id: string; role?: string; email?: string } | null },
    ): Promise<AuthorsDocument[]>;
    findOne(
      filter: Record<string, unknown> & { locale?: string; status?: "draft" | "published" | "any" },
      context?: { user?: { id: string; role?: string; email?: string } | null },
    ): Promise<AuthorsDocument | null>;
    findById(
      id: string,
      options?: { locale?: string; status?: "draft" | "published" | "any" },
      context?: { user?: { id: string; role?: string; email?: string } | null },
    ): Promise<AuthorsDocument | null>;
    create(
      data: AuthorsInput,
      context?: { user?: { id: string; role?: string; email?: string } | null },
    ): Promise<AuthorsDocument>;
    update(
      id: string,
      data: Partial<AuthorsInput>,
      context?: { user?: { id: string; role?: string; email?: string } | null },
    ): Promise<AuthorsDocument>;
    delete(id: string, context?: { user?: { id: string; role?: string; email?: string } | null }): Promise<void>;
    count(
      filter?: Omit<import("../core/api").FindOptions, "limit" | "offset" | "sort">,
      context?: { user?: { id: string; role?: string; email?: string } | null },
    ): Promise<number>;
    versions(id: string): Promise<import("./types").StoredVersion[]>;
    restore(
      id: string,
      versionNumber: number,
      context?: { user?: { id: string; role?: string; email?: string } | null },
    ): Promise<AuthorsDocument>;
    publish(
      id: string,
      context?: { user?: { id: string; role?: string; email?: string } | null },
    ): Promise<AuthorsDocument>;
    unpublish(
      id: string,
      context?: { user?: { id: string; role?: string; email?: string } | null },
    ): Promise<AuthorsDocument>;
    getTranslations(id: string): Promise<Record<string, AuthorsTranslationInput>>;
    upsertTranslation(
      id: string,
      locale: string,
      data: AuthorsTranslationInput,
      context?: { user?: { id: string; role?: string; email?: string } | null },
    ): Promise<AuthorsDocument>;
  };
  posts: {
    find(
      options?: import("../core/api").FindOptions,
      context?: { user?: { id: string; role?: string; email?: string } | null },
    ): Promise<PostsDocument[]>;
    findOne(
      filter: Record<string, unknown> & { locale?: string; status?: "draft" | "published" | "any" },
      context?: { user?: { id: string; role?: string; email?: string } | null },
    ): Promise<PostsDocument | null>;
    findById(
      id: string,
      options?: { locale?: string; status?: "draft" | "published" | "any" },
      context?: { user?: { id: string; role?: string; email?: string } | null },
    ): Promise<PostsDocument | null>;
    create(
      data: PostsInput,
      context?: { user?: { id: string; role?: string; email?: string } | null },
    ): Promise<PostsDocument>;
    update(
      id: string,
      data: Partial<PostsInput>,
      context?: { user?: { id: string; role?: string; email?: string } | null },
    ): Promise<PostsDocument>;
    delete(id: string, context?: { user?: { id: string; role?: string; email?: string } | null }): Promise<void>;
    count(
      filter?: Omit<import("../core/api").FindOptions, "limit" | "offset" | "sort">,
      context?: { user?: { id: string; role?: string; email?: string } | null },
    ): Promise<number>;
    versions(id: string): Promise<import("./types").StoredVersion[]>;
    restore(
      id: string,
      versionNumber: number,
      context?: { user?: { id: string; role?: string; email?: string } | null },
    ): Promise<PostsDocument>;
    publish(
      id: string,
      context?: { user?: { id: string; role?: string; email?: string } | null },
    ): Promise<PostsDocument>;
    unpublish(
      id: string,
      context?: { user?: { id: string; role?: string; email?: string } | null },
    ): Promise<PostsDocument>;
    getTranslations(id: string): Promise<Record<string, PostsTranslationInput>>;
    upsertTranslation(
      id: string,
      locale: string,
      data: PostsTranslationInput,
      context?: { user?: { id: string; role?: string; email?: string } | null },
    ): Promise<PostsDocument>;
  };
  pages: {
    find(
      options?: import("../core/api").FindOptions,
      context?: { user?: { id: string; role?: string; email?: string } | null },
    ): Promise<PagesDocument[]>;
    findOne(
      filter: Record<string, unknown> & { locale?: string; status?: "draft" | "published" | "any" },
      context?: { user?: { id: string; role?: string; email?: string } | null },
    ): Promise<PagesDocument | null>;
    findById(
      id: string,
      options?: { locale?: string; status?: "draft" | "published" | "any" },
      context?: { user?: { id: string; role?: string; email?: string } | null },
    ): Promise<PagesDocument | null>;
    create(
      data: PagesInput,
      context?: { user?: { id: string; role?: string; email?: string } | null },
    ): Promise<PagesDocument>;
    update(
      id: string,
      data: Partial<PagesInput>,
      context?: { user?: { id: string; role?: string; email?: string } | null },
    ): Promise<PagesDocument>;
    delete(id: string, context?: { user?: { id: string; role?: string; email?: string } | null }): Promise<void>;
    count(
      filter?: Omit<import("../core/api").FindOptions, "limit" | "offset" | "sort">,
      context?: { user?: { id: string; role?: string; email?: string } | null },
    ): Promise<number>;
    versions(id: string): Promise<import("./types").StoredVersion[]>;
    restore(
      id: string,
      versionNumber: number,
      context?: { user?: { id: string; role?: string; email?: string } | null },
    ): Promise<PagesDocument>;
    publish(
      id: string,
      context?: { user?: { id: string; role?: string; email?: string } | null },
    ): Promise<PagesDocument>;
    unpublish(
      id: string,
      context?: { user?: { id: string; role?: string; email?: string } | null },
    ): Promise<PagesDocument>;
    getTranslations(id: string): Promise<Record<string, PagesTranslationInput>>;
    upsertTranslation(
      id: string,
      locale: string,
      data: PagesTranslationInput,
      context?: { user?: { id: string; role?: string; email?: string } | null },
    ): Promise<PagesDocument>;
  };
};

// Auto-seed on first import (idempotent — only inserts if tables are empty)
export const ready = seedDatabase(config).catch((e: any) => console.warn("CMS seed:", e.message));
