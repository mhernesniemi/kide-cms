import config from "virtual:kide/config";
import { cms } from "virtual:kide/api";
import { formatDate, getDateSettings, getPageHref, getTranslatableFieldNames } from "../../core";
import { canRead } from "../lib/access";
import type { AdminUser } from "./types";

export async function loadSinglesView(user: AdminUser, workingLocale?: string) {
  const runtimeContext = user ? { user } : {};
  const cmsRuntime = cms as Record<string, any>;
  const defaultLocale = config.locales?.default ?? "en";
  const locales = config.locales?.supported ?? [];
  const contentLocale = workingLocale ?? defaultLocale;

  const singletonCollections = config.collections.filter((c) => c.singleton && canRead(config, user, c.slug));
  // Same rule as ListView: a Locales column is only meaningful with more than one
  // locale and at least one singleton having translatable fields.
  const showLocalesColumn =
    locales.length > 1 && singletonCollections.some((c) => getTranslatableFieldNames(c).length > 0);
  // Mirrors ListView's own getPagePath, so the listed URL matches what the
  // singleton's own "Preview" button links to.
  const getPagePath = (
    sc: (typeof singletonCollections)[number],
    doc: Record<string, unknown> | null,
  ): string | null => {
    if (!sc.preview) return null;
    if (typeof sc.preview === "string") return sc.preview;
    return doc ? cms.meta.getRouteForDocument(sc.slug, doc) : null;
  };

  const singletonsData = await Promise.all(
    singletonCollections.map(async (sc) => {
      const api = cmsRuntime[sc.slug];
      const singleDocs = await api.find({ status: "any", limit: 1, locale: contentLocale }, runtimeContext);
      const singleDoc = singleDocs[0] ?? null;
      const pagePath = getPagePath(sc, singleDoc);
      return {
        id: singleDoc ? String(singleDoc._id) : "",
        collectionSlug: sc.slug,
        label: sc.labels.singular,
        status: singleDoc && sc.drafts ? String(singleDoc._status ?? "draft") : "",
        locales: singleDoc
          ? Array.isArray(singleDoc._availableLocales)
            ? singleDoc._availableLocales.map((l: string) => String(l))
            : [defaultLocale]
          : [],
        localeStates: singleDoc?._localeStates as Record<string, { status: string; outdated?: boolean }> | undefined,
        updatedAt: singleDoc ? formatDate(singleDoc._updatedAt) : "—",
        editHref: `/admin/${sc.slug}`,
        page: pagePath,
        pageHref: pagePath
          ? getPageHref(pagePath, !!singleDoc && (!sc.drafts || singleDoc._status === "published"))
          : null,
      };
    }),
  );

  return {
    singletonsData,
    showLocalesColumn,
    locales,
    dateSettings: getDateSettings(),
    anyDrafts: singletonCollections.some((c) => c.drafts),
  };
}
