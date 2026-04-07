// auto-generated — do not edit
import config from "../cms.config";
import { createCms } from "../runtime";
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
  TaxonomiesDocument,
  TaxonomiesInput,
  TaxonomiesTranslationInput,
  MenusDocument,
  MenusInput,
  MenusTranslationInput,
  FrontPageDocument,
  FrontPageInput,
  FrontPageTranslationInput,
  PagesDocument,
  PagesInput,
  PagesTranslationInput,
} from "./types";

export const cms = createCms(config) as {
  users: {
    find(options?: import("@kide/core").FindOptions, context?: { user?: { id: string; role?: string; email?: string } | null }): Promise<UsersDocument[]>;
    findOne(filter: Record<string, unknown> & { locale?: string; status?: "draft" | "published" | "scheduled" | "any" }, context?: { user?: { id: string; role?: string; email?: string } | null }): Promise<UsersDocument | null>;
    findById(id: string, options?: { locale?: string; status?: "draft" | "published" | "scheduled" | "any" }, context?: { user?: { id: string; role?: string; email?: string } | null }): Promise<UsersDocument | null>;
    create(data: UsersInput, context?: { user?: { id: string; role?: string; email?: string } | null }): Promise<UsersDocument>;
    update(id: string, data: Partial<UsersInput>, context?: { user?: { id: string; role?: string; email?: string } | null }): Promise<UsersDocument>;
    delete(id: string, context?: { user?: { id: string; role?: string; email?: string } | null }): Promise<void>;
    count(filter?: Omit<import("@kide/core").FindOptions, "limit" | "offset" | "sort">, context?: { user?: { id: string; role?: string; email?: string } | null }): Promise<number>;
    versions(id: string): Promise<import("./types").StoredVersion[]>;
    restore(id: string, versionNumber: number, context?: { user?: { id: string; role?: string; email?: string } | null }): Promise<UsersDocument>;
    publish(id: string, context?: { user?: { id: string; role?: string; email?: string } | null }): Promise<UsersDocument>;
    unpublish(id: string, context?: { user?: { id: string; role?: string; email?: string } | null }): Promise<UsersDocument>;
    schedule(id: string, publishAt: string, unpublishAt?: string | null, context?: { user?: { id: string; role?: string; email?: string } | null }): Promise<UsersDocument>;
    getTranslations(id: string): Promise<Record<string, UsersTranslationInput>>;
    upsertTranslation(id: string, locale: string, data: UsersTranslationInput, context?: { user?: { id: string; role?: string; email?: string } | null }): Promise<UsersDocument>;
  };
  authors: {
    find(options?: import("@kide/core").FindOptions, context?: { user?: { id: string; role?: string; email?: string } | null }): Promise<AuthorsDocument[]>;
    findOne(filter: Record<string, unknown> & { locale?: string; status?: "draft" | "published" | "scheduled" | "any" }, context?: { user?: { id: string; role?: string; email?: string } | null }): Promise<AuthorsDocument | null>;
    findById(id: string, options?: { locale?: string; status?: "draft" | "published" | "scheduled" | "any" }, context?: { user?: { id: string; role?: string; email?: string } | null }): Promise<AuthorsDocument | null>;
    create(data: AuthorsInput, context?: { user?: { id: string; role?: string; email?: string } | null }): Promise<AuthorsDocument>;
    update(id: string, data: Partial<AuthorsInput>, context?: { user?: { id: string; role?: string; email?: string } | null }): Promise<AuthorsDocument>;
    delete(id: string, context?: { user?: { id: string; role?: string; email?: string } | null }): Promise<void>;
    count(filter?: Omit<import("@kide/core").FindOptions, "limit" | "offset" | "sort">, context?: { user?: { id: string; role?: string; email?: string } | null }): Promise<number>;
    versions(id: string): Promise<import("./types").StoredVersion[]>;
    restore(id: string, versionNumber: number, context?: { user?: { id: string; role?: string; email?: string } | null }): Promise<AuthorsDocument>;
    publish(id: string, context?: { user?: { id: string; role?: string; email?: string } | null }): Promise<AuthorsDocument>;
    unpublish(id: string, context?: { user?: { id: string; role?: string; email?: string } | null }): Promise<AuthorsDocument>;
    schedule(id: string, publishAt: string, unpublishAt?: string | null, context?: { user?: { id: string; role?: string; email?: string } | null }): Promise<AuthorsDocument>;
    getTranslations(id: string): Promise<Record<string, AuthorsTranslationInput>>;
    upsertTranslation(id: string, locale: string, data: AuthorsTranslationInput, context?: { user?: { id: string; role?: string; email?: string } | null }): Promise<AuthorsDocument>;
  };
  posts: {
    find(options?: import("@kide/core").FindOptions, context?: { user?: { id: string; role?: string; email?: string } | null }): Promise<PostsDocument[]>;
    findOne(filter: Record<string, unknown> & { locale?: string; status?: "draft" | "published" | "scheduled" | "any" }, context?: { user?: { id: string; role?: string; email?: string } | null }): Promise<PostsDocument | null>;
    findById(id: string, options?: { locale?: string; status?: "draft" | "published" | "scheduled" | "any" }, context?: { user?: { id: string; role?: string; email?: string } | null }): Promise<PostsDocument | null>;
    create(data: PostsInput, context?: { user?: { id: string; role?: string; email?: string } | null }): Promise<PostsDocument>;
    update(id: string, data: Partial<PostsInput>, context?: { user?: { id: string; role?: string; email?: string } | null }): Promise<PostsDocument>;
    delete(id: string, context?: { user?: { id: string; role?: string; email?: string } | null }): Promise<void>;
    count(filter?: Omit<import("@kide/core").FindOptions, "limit" | "offset" | "sort">, context?: { user?: { id: string; role?: string; email?: string } | null }): Promise<number>;
    versions(id: string): Promise<import("./types").StoredVersion[]>;
    restore(id: string, versionNumber: number, context?: { user?: { id: string; role?: string; email?: string } | null }): Promise<PostsDocument>;
    publish(id: string, context?: { user?: { id: string; role?: string; email?: string } | null }): Promise<PostsDocument>;
    unpublish(id: string, context?: { user?: { id: string; role?: string; email?: string } | null }): Promise<PostsDocument>;
    schedule(id: string, publishAt: string, unpublishAt?: string | null, context?: { user?: { id: string; role?: string; email?: string } | null }): Promise<PostsDocument>;
    getTranslations(id: string): Promise<Record<string, PostsTranslationInput>>;
    upsertTranslation(id: string, locale: string, data: PostsTranslationInput, context?: { user?: { id: string; role?: string; email?: string } | null }): Promise<PostsDocument>;
  };
  taxonomies: {
    find(options?: import("@kide/core").FindOptions, context?: { user?: { id: string; role?: string; email?: string } | null }): Promise<TaxonomiesDocument[]>;
    findOne(filter: Record<string, unknown> & { locale?: string; status?: "draft" | "published" | "scheduled" | "any" }, context?: { user?: { id: string; role?: string; email?: string } | null }): Promise<TaxonomiesDocument | null>;
    findById(id: string, options?: { locale?: string; status?: "draft" | "published" | "scheduled" | "any" }, context?: { user?: { id: string; role?: string; email?: string } | null }): Promise<TaxonomiesDocument | null>;
    create(data: TaxonomiesInput, context?: { user?: { id: string; role?: string; email?: string } | null }): Promise<TaxonomiesDocument>;
    update(id: string, data: Partial<TaxonomiesInput>, context?: { user?: { id: string; role?: string; email?: string } | null }): Promise<TaxonomiesDocument>;
    delete(id: string, context?: { user?: { id: string; role?: string; email?: string } | null }): Promise<void>;
    count(filter?: Omit<import("@kide/core").FindOptions, "limit" | "offset" | "sort">, context?: { user?: { id: string; role?: string; email?: string } | null }): Promise<number>;
    versions(id: string): Promise<import("./types").StoredVersion[]>;
    restore(id: string, versionNumber: number, context?: { user?: { id: string; role?: string; email?: string } | null }): Promise<TaxonomiesDocument>;
    publish(id: string, context?: { user?: { id: string; role?: string; email?: string } | null }): Promise<TaxonomiesDocument>;
    unpublish(id: string, context?: { user?: { id: string; role?: string; email?: string } | null }): Promise<TaxonomiesDocument>;
    schedule(id: string, publishAt: string, unpublishAt?: string | null, context?: { user?: { id: string; role?: string; email?: string } | null }): Promise<TaxonomiesDocument>;
    getTranslations(id: string): Promise<Record<string, TaxonomiesTranslationInput>>;
    upsertTranslation(id: string, locale: string, data: TaxonomiesTranslationInput, context?: { user?: { id: string; role?: string; email?: string } | null }): Promise<TaxonomiesDocument>;
  };
  menus: {
    find(options?: import("@kide/core").FindOptions, context?: { user?: { id: string; role?: string; email?: string } | null }): Promise<MenusDocument[]>;
    findOne(filter: Record<string, unknown> & { locale?: string; status?: "draft" | "published" | "scheduled" | "any" }, context?: { user?: { id: string; role?: string; email?: string } | null }): Promise<MenusDocument | null>;
    findById(id: string, options?: { locale?: string; status?: "draft" | "published" | "scheduled" | "any" }, context?: { user?: { id: string; role?: string; email?: string } | null }): Promise<MenusDocument | null>;
    create(data: MenusInput, context?: { user?: { id: string; role?: string; email?: string } | null }): Promise<MenusDocument>;
    update(id: string, data: Partial<MenusInput>, context?: { user?: { id: string; role?: string; email?: string } | null }): Promise<MenusDocument>;
    delete(id: string, context?: { user?: { id: string; role?: string; email?: string } | null }): Promise<void>;
    count(filter?: Omit<import("@kide/core").FindOptions, "limit" | "offset" | "sort">, context?: { user?: { id: string; role?: string; email?: string } | null }): Promise<number>;
    versions(id: string): Promise<import("./types").StoredVersion[]>;
    restore(id: string, versionNumber: number, context?: { user?: { id: string; role?: string; email?: string } | null }): Promise<MenusDocument>;
    publish(id: string, context?: { user?: { id: string; role?: string; email?: string } | null }): Promise<MenusDocument>;
    unpublish(id: string, context?: { user?: { id: string; role?: string; email?: string } | null }): Promise<MenusDocument>;
    schedule(id: string, publishAt: string, unpublishAt?: string | null, context?: { user?: { id: string; role?: string; email?: string } | null }): Promise<MenusDocument>;
    getTranslations(id: string): Promise<Record<string, MenusTranslationInput>>;
    upsertTranslation(id: string, locale: string, data: MenusTranslationInput, context?: { user?: { id: string; role?: string; email?: string } | null }): Promise<MenusDocument>;
  };
  "front-page": {
    find(options?: import("@kide/core").FindOptions, context?: { user?: { id: string; role?: string; email?: string } | null }): Promise<FrontPageDocument[]>;
    findOne(filter: Record<string, unknown> & { locale?: string; status?: "draft" | "published" | "scheduled" | "any" }, context?: { user?: { id: string; role?: string; email?: string } | null }): Promise<FrontPageDocument | null>;
    findById(id: string, options?: { locale?: string; status?: "draft" | "published" | "scheduled" | "any" }, context?: { user?: { id: string; role?: string; email?: string } | null }): Promise<FrontPageDocument | null>;
    create(data: FrontPageInput, context?: { user?: { id: string; role?: string; email?: string } | null }): Promise<FrontPageDocument>;
    update(id: string, data: Partial<FrontPageInput>, context?: { user?: { id: string; role?: string; email?: string } | null }): Promise<FrontPageDocument>;
    delete(id: string, context?: { user?: { id: string; role?: string; email?: string } | null }): Promise<void>;
    count(filter?: Omit<import("@kide/core").FindOptions, "limit" | "offset" | "sort">, context?: { user?: { id: string; role?: string; email?: string } | null }): Promise<number>;
    versions(id: string): Promise<import("./types").StoredVersion[]>;
    restore(id: string, versionNumber: number, context?: { user?: { id: string; role?: string; email?: string } | null }): Promise<FrontPageDocument>;
    publish(id: string, context?: { user?: { id: string; role?: string; email?: string } | null }): Promise<FrontPageDocument>;
    unpublish(id: string, context?: { user?: { id: string; role?: string; email?: string } | null }): Promise<FrontPageDocument>;
    schedule(id: string, publishAt: string, unpublishAt?: string | null, context?: { user?: { id: string; role?: string; email?: string } | null }): Promise<FrontPageDocument>;
    getTranslations(id: string): Promise<Record<string, FrontPageTranslationInput>>;
    upsertTranslation(id: string, locale: string, data: FrontPageTranslationInput, context?: { user?: { id: string; role?: string; email?: string } | null }): Promise<FrontPageDocument>;
  };
  pages: {
    find(options?: import("@kide/core").FindOptions, context?: { user?: { id: string; role?: string; email?: string } | null }): Promise<PagesDocument[]>;
    findOne(filter: Record<string, unknown> & { locale?: string; status?: "draft" | "published" | "scheduled" | "any" }, context?: { user?: { id: string; role?: string; email?: string } | null }): Promise<PagesDocument | null>;
    findById(id: string, options?: { locale?: string; status?: "draft" | "published" | "scheduled" | "any" }, context?: { user?: { id: string; role?: string; email?: string } | null }): Promise<PagesDocument | null>;
    create(data: PagesInput, context?: { user?: { id: string; role?: string; email?: string } | null }): Promise<PagesDocument>;
    update(id: string, data: Partial<PagesInput>, context?: { user?: { id: string; role?: string; email?: string } | null }): Promise<PagesDocument>;
    delete(id: string, context?: { user?: { id: string; role?: string; email?: string } | null }): Promise<void>;
    count(filter?: Omit<import("@kide/core").FindOptions, "limit" | "offset" | "sort">, context?: { user?: { id: string; role?: string; email?: string } | null }): Promise<number>;
    versions(id: string): Promise<import("./types").StoredVersion[]>;
    restore(id: string, versionNumber: number, context?: { user?: { id: string; role?: string; email?: string } | null }): Promise<PagesDocument>;
    publish(id: string, context?: { user?: { id: string; role?: string; email?: string } | null }): Promise<PagesDocument>;
    unpublish(id: string, context?: { user?: { id: string; role?: string; email?: string } | null }): Promise<PagesDocument>;
    schedule(id: string, publishAt: string, unpublishAt?: string | null, context?: { user?: { id: string; role?: string; email?: string } | null }): Promise<PagesDocument>;
    getTranslations(id: string): Promise<Record<string, PagesTranslationInput>>;
    upsertTranslation(id: string, locale: string, data: PagesTranslationInput, context?: { user?: { id: string; role?: string; email?: string } | null }): Promise<PagesDocument>;
  };
  meta: ReturnType<typeof createCms>["meta"];
  scheduled: ReturnType<typeof createCms>["scheduled"];
};
