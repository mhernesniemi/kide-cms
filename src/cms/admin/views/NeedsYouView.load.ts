import config from "virtual:kide/config";
import { cms } from "virtual:kide/api";
import { collaboration } from "virtual:kide/runtime";
import { formatDate, getLabelField, isApprover, resolveCollaboration } from "../../core";
import { canRead, getVisualStatus } from "../lib/access";
import { REVIEW_STATE_META, eligibleCollabSlugs, loadNeedsYou } from "../lib/collaboration";
import type { AdminUser } from "./types";

export async function loadNeedsYouView(user: AdminUser, workingLocale?: string) {
  const runtimeContext = user ? { user } : {};
  const cmsRuntime = cms as Record<string, any>;
  const defaultLocale = config.locales?.default ?? "en";
  const contentLocale = workingLocale ?? defaultLocale;

  const eligible = eligibleCollabSlugs(config, user, resolveCollaboration, canRead);
  const approver = isApprover(config, user?.role);

  const items = user
    ? await loadNeedsYou({ collaboration, userId: String(user.id), isApprover: approver, eligibleSlugs: eligible })
    : [];

  // Hydrate each queued document. A row whose document is gone is skipped rather
  // than rendered as a broken link.
  type Hydrated = { item: (typeof items)[number]; doc: Record<string, unknown>; collection: any };
  const hydrated: Hydrated[] = [];
  for (const item of items) {
    const collection = config.collections.find((c: any) => c.slug === item.collectionSlug);
    const api = cmsRuntime[item.collectionSlug];
    if (!collection || !api) continue;
    const doc = await api
      .findById(item.documentId, { status: "any", locale: contentLocale }, runtimeContext)
      .catch(() => null);
    if (!doc) continue;
    hydrated.push({ item, doc, collection });
  }

  hydrated.sort((a, b) => String(b.doc._updatedAt ?? "").localeCompare(String(a.doc._updatedAt ?? "")));

  const rows = hydrated.map(({ item, doc, collection }) => {
    const displayTitle = collection.singleton
      ? collection.labels.singular
      : String(doc[getLabelField(collection)] ?? doc.slug ?? collection.labels.singular);

    return {
      id: `${item.collectionSlug}:${item.documentId}`,
      editHref: `/admin/${item.collectionSlug}/${item.documentId}`,
      status: collection.drafts ? getVisualStatus(doc) : "",
      singleton: collection.singleton,
      locales: [defaultLocale],
      searchText: displayTitle,
      values: {
        title: displayTitle,
        collection: collection.labels.singular,
        _review: REVIEW_STATE_META[item.reviewState].label,
        _reason: item.reason === "assigned" ? "Assigned to you" : "Waiting for your review",
        _updatedAt: formatDate(doc._updatedAt),
      },
    };
  });

  return { rows, approver };
}
