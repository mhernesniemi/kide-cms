import {
  SHARED_SECTIONS_COLLECTION,
  extractSharedSectionRefsFromDocument,
  getLabelField,
  type SharedSectionOption,
} from "../../core";
import { canRead } from "./access";

type User = { id: string; role?: string; email?: string } | null | undefined;
type CmsRuntime = Record<string, any> & { meta: { getRouteForDocument: (slug: string, doc: any) => string } };
type RuntimeContext = Record<string, unknown>;
type CollectionLike = { slug: string; fields: Record<string, any> };

type LoadedDocument = {
  doc: Record<string, unknown> | null;
  baseDoc: Record<string, unknown> | null;
  /** Locale the base row is written in — the tab that edits the document itself. */
  baseLocale: string;
  /** The locale actually shown: the request's, else the base locale. */
  locale: string;
  versions: Array<{ version: number; createdAt: string }>;
};

/** Load the primary doc, base-locale doc (for translation source), and versions list. */
export async function loadDocument(
  collectionApi: any,
  documentId: string,
  requestedLocale: string | null,
  defaultLocale: string,
  runtimeContext: RuntimeContext,
): Promise<LoadedDocument> {
  const base = await collectionApi.findById(documentId, { status: "any" }, runtimeContext);
  if (!base) return { doc: null, baseDoc: null, baseLocale: defaultLocale, locale: defaultLocale, versions: [] };
  const baseLocale = String(base._sourceLocale ?? defaultLocale);
  const locale = requestedLocale ?? baseLocale;
  const doc =
    locale === baseLocale ? base : await collectionApi.findById(documentId, { status: "any", locale }, runtimeContext);
  const versions = await collectionApi.versions(documentId, runtimeContext);
  return { doc, baseDoc: base, baseLocale, locale, versions };
}

export type RelationMeta = {
  collectionSlug: string;
  collectionLabel: string;
  hasMany: boolean;
  labelField?: string;
};

/** Relation metadata for the edit form. Option lists are no longer preloaded:
 * the combobox searches the target collection on the server and resolves
 * labels for already-selected ids itself (see RelationField). */
export function loadRelationMeta(collection: CollectionLike, config: any, user: User): Record<string, RelationMeta> {
  const relationMetaByField: Record<string, RelationMeta> = {};
  for (const [fieldName, field] of Object.entries(collection.fields) as [string, any][]) {
    if (field.type !== "relation" || !canRead(config, user, field.collection)) continue;
    const relatedCollection = config.collections.find((c: any) => c.slug === field.collection);
    if (!relatedCollection) continue;
    relationMetaByField[fieldName] = {
      collectionSlug: field.collection,
      collectionLabel: relatedCollection.labels.singular,
      hasMany: field.hasMany ?? false,
      labelField: getLabelField(relatedCollection),
    };
  }
  return relationMetaByField;
}

/** Labels for the ids a document's relation fields currently point at, so the
 * edit form renders selections named without a client round trip. Only the
 * selected ids are fetched — never a catalogue. */
export async function loadRelationLabels(
  collection: CollectionLike,
  doc: Record<string, unknown> | null,
  config: any,
  user: User,
  cmsRuntime: CmsRuntime,
  defaultLocale: string,
  runtimeContext: RuntimeContext,
): Promise<Record<string, Array<{ value: string; label: string }>>> {
  const labelsByField: Record<string, Array<{ value: string; label: string }>> = {};
  if (!doc) return labelsByField;

  for (const [fieldName, field] of Object.entries(collection.fields) as [string, any][]) {
    if (field.type !== "relation" || !canRead(config, user, field.collection)) continue;
    const relatedCollection = config.collections.find((c: any) => c.slug === field.collection);
    const api = cmsRuntime[field.collection];
    if (!relatedCollection || !api) continue;

    let raw = doc[fieldName];
    if (field.hasMany && typeof raw === "string") {
      try {
        raw = JSON.parse(raw);
      } catch {
        raw = [];
      }
    }
    const ids = field.hasMany ? (Array.isArray(raw) ? raw.map(String) : []) : raw ? [String(raw)] : [];
    if (ids.length === 0) continue;

    const labelField = getLabelField(relatedCollection);
    const relatedDocs = await Promise.all(
      ids.map((id) =>
        api
          .find({ where: { _id: id }, status: "any", limit: 1, locale: defaultLocale }, runtimeContext)
          .then((docs: Array<Record<string, unknown>>) => docs[0])
          .catch(() => undefined),
      ),
    );
    labelsByField[fieldName] = ids.flatMap((id, i) => {
      const related = relatedDocs[i];
      return related ? [{ value: id, label: String(related[labelField] ?? related.slug ?? id) }] : [];
    });
  }

  return labelsByField;
}

/** Label lookup for list columns that show a relation. Capped; fine for the
 * small reference collections such columns usually point at. */
export const loadRelationOptionList = async (
  collectionSlug: string,
  config: any,
  cmsRuntime: CmsRuntime,
  defaultLocale: string,
  runtimeContext: RuntimeContext,
) => {
  const relatedDocs = await cmsRuntime[collectionSlug].find(
    { status: "any", limit: 100, sort: { field: "_updatedAt", direction: "desc" }, locale: defaultLocale },
    runtimeContext,
  );
  const relatedCollection = config.collections.find((c: any) => c.slug === collectionSlug);
  const labelField = relatedCollection ? getLabelField(relatedCollection) : "title";
  return relatedDocs.map((item: Record<string, unknown>) => ({
    value: String(item._id),
    label: String(item[labelField] ?? item.slug ?? item._id),
  }));
};

export async function loadSharedSectionOptions(
  config: any,
  user: User,
  cmsRuntime: CmsRuntime,
  defaultLocale: string,
  runtimeContext: RuntimeContext,
): Promise<SharedSectionOption[]> {
  if (!config.collections.some((c: any) => c.slug === SHARED_SECTIONS_COLLECTION)) return [];
  if (!canRead(config, user, SHARED_SECTIONS_COLLECTION)) return [];
  const api = cmsRuntime[SHARED_SECTIONS_COLLECTION];
  if (!api) return [];

  const docs = await api.find(
    { status: "any", limit: 500, sort: { field: "title", direction: "asc" }, locale: defaultLocale },
    runtimeContext,
  );

  return docs.map((doc: Record<string, unknown>) => ({
    id: String(doc._id),
    title: String(doc.title ?? doc._id),
    blockType: String(doc.blockType ?? (doc.block as Record<string, unknown> | undefined)?.type ?? ""),
    status: String(doc._status ?? "draft"),
  }));
}

export async function loadSharedSectionUsage(
  sectionId: string,
  config: any,
  user: User,
  cmsRuntime: CmsRuntime,
  defaultLocale: string,
  runtimeContext: RuntimeContext,
): Promise<ReverseRef[]> {
  const reverseRefs: ReverseRef[] = [];

  for (const otherCollection of config.collections) {
    if (otherCollection.slug === SHARED_SECTIONS_COLLECTION || !canRead(config, user, otherCollection.slug)) continue;
    const hasSharedCapableField = Object.values(otherCollection.fields).some(
      (field: any) => (field.type === "blocks" && field.shared !== false) || field.type === "content",
    );
    if (!hasSharedCapableField) continue;

    const otherApi = cmsRuntime[otherCollection.slug];
    if (!otherApi) continue;
    const otherLabelField = getLabelField(otherCollection);

    try {
      const docs = await otherApi.find({ status: "any", limit: 500, locale: defaultLocale }, runtimeContext);
      const matched = docs.filter((doc: Record<string, unknown>) =>
        extractSharedSectionRefsFromDocument(otherCollection, doc).includes(sectionId),
      );
      if (matched.length > 0) {
        reverseRefs.push({
          collectionLabel: otherCollection.singleton ? "Singleton" : otherCollection.labels.plural,
          collectionSlug: otherCollection.slug,
          docs: matched.map((doc: Record<string, unknown>) => ({
            _id: String(doc._id),
            label: otherCollection.singleton
              ? otherCollection.labels.singular
              : String(doc[otherLabelField] ?? doc.slug ?? doc._id),
          })),
        });
      }
    } catch {
      // ignore individual collection failures
    }
  }

  return reverseRefs;
}

export async function loadSharedSectionUsageCounts(
  sectionIds: string[],
  config: any,
  user: User,
  cmsRuntime: CmsRuntime,
  defaultLocale: string,
  runtimeContext: RuntimeContext,
): Promise<Record<string, number>> {
  const counts = Object.fromEntries(sectionIds.map((id) => [id, 0]));
  const sectionIdSet = new Set(sectionIds);

  if (sectionIds.length === 0) return counts;

  for (const otherCollection of config.collections) {
    if (otherCollection.slug === SHARED_SECTIONS_COLLECTION || !canRead(config, user, otherCollection.slug)) continue;
    const hasSharedCapableField = Object.values(otherCollection.fields).some(
      (field: any) => (field.type === "blocks" && field.shared !== false) || field.type === "content",
    );
    if (!hasSharedCapableField) continue;

    const otherApi = cmsRuntime[otherCollection.slug];
    if (!otherApi) continue;

    try {
      const docs = await otherApi.find({ status: "any", limit: 500, locale: defaultLocale }, runtimeContext);
      for (const doc of docs as Array<Record<string, unknown>>) {
        const refs = new Set(extractSharedSectionRefsFromDocument(otherCollection, doc));
        for (const ref of refs) {
          if (sectionIdSet.has(ref)) counts[ref] = (counts[ref] ?? 0) + 1;
        }
      }
    } catch {
      // ignore individual collection failures
    }
  }

  return counts;
}

export type LinkableCollection = { collection: string; label: string };

/** Collections whose documents an internal link may point at. The picker
 * searches them on the server; nothing is preloaded. */
export function loadLinkableCollections(config: any, user: User): LinkableCollection[] {
  return config.collections
    .filter(
      (c: any) =>
        !c.singleton &&
        !["users", "menus", "taxonomies", "authors"].includes(c.slug) &&
        c.fields.slug &&
        canRead(config, user, c.slug),
    )
    .map((c: any) => ({ collection: c.slug, label: c.labels.plural }));
}

export type ReverseRef = {
  collectionLabel: string;
  collectionSlug: string;
  docs: Array<{ _id: string; label: string }>;
};

/** Find documents in other collections that link to this doc via relation fields. */
export async function loadReverseRefs(
  collection: CollectionLike,
  documentId: string,
  config: any,
  user: User,
  cmsRuntime: CmsRuntime,
  defaultLocale: string,
  runtimeContext: RuntimeContext,
): Promise<ReverseRef[]> {
  if (collection.slug === SHARED_SECTIONS_COLLECTION) {
    return loadSharedSectionUsage(documentId, config, user, cmsRuntime, defaultLocale, runtimeContext);
  }

  const reverseRefs: ReverseRef[] = [];
  for (const otherCollection of config.collections) {
    if (otherCollection.slug === collection.slug || !canRead(config, user, otherCollection.slug)) continue;
    const relationFields = Object.entries(otherCollection.fields).filter(
      ([, f]) => (f as any).type === "relation" && (f as any).collection === collection.slug,
    );
    if (relationFields.length === 0) continue;
    const otherApi = cmsRuntime[otherCollection.slug];
    if (!otherApi) continue;
    const otherLabelField = getLabelField(otherCollection);
    for (const [fieldName, field] of relationFields) {
      try {
        const isMany = (field as any).hasMany;
        if (isMany) {
          const allDocs = await otherApi.find({ status: "any", limit: 200, locale: defaultLocale }, runtimeContext);
          const matched = allDocs.filter((r: Record<string, unknown>) => {
            const val = r[fieldName];
            if (Array.isArray(val)) return val.includes(documentId);
            if (typeof val === "string") return val.includes(documentId);
            return false;
          });
          if (matched.length > 0) {
            reverseRefs.push({
              collectionLabel: otherCollection.singleton ? "Singleton" : otherCollection.labels.plural,
              collectionSlug: otherCollection.slug,
              docs: matched.map((r: Record<string, unknown>) => ({
                _id: String(r._id),
                label: otherCollection.singleton
                  ? otherCollection.labels.singular
                  : String(r[otherLabelField] ?? r.slug ?? r._id),
              })),
            });
          }
        } else {
          const refs = await otherApi.find(
            { status: "any", where: { [fieldName]: documentId }, limit: 50, locale: defaultLocale },
            runtimeContext,
          );
          if (refs.length > 0) {
            reverseRefs.push({
              collectionLabel: otherCollection.singleton ? "Singleton" : otherCollection.labels.plural,
              collectionSlug: otherCollection.slug,
              docs: refs.map((r: Record<string, unknown>) => ({
                _id: String(r._id),
                label: otherCollection.singleton
                  ? otherCollection.labels.singular
                  : String(r[otherLabelField] ?? r.slug ?? r._id),
              })),
            });
          }
        }
      } catch {
        // ignore individual relation fetch failures
      }
    }
  }
  return reverseRefs;
}

export type FormSubmissionRow = {
  id: string;
  editHref: string;
  status: string;
  locales: string[];
  searchText: string;
  values: Record<string, string>;
};

/** Load submissions for a specific form, formatted for DocumentsDataTable rendering. */
export async function loadFormSubmissions(
  formDocumentId: string,
  defaultLocale: string,
  cmsRuntime: CmsRuntime,
  runtimeContext: RuntimeContext,
  formatDate: (v: unknown) => string,
): Promise<{ submissionRows: FormSubmissionRow[]; submissionCount: number }> {
  try {
    const submissions = (await cmsRuntime["form-submissions"].find(
      { where: { form: formDocumentId }, sort: { field: "_createdAt", direction: "desc" }, limit: 500 },
      runtimeContext,
    )) as Array<Record<string, unknown>>;
    const submissionRows: FormSubmissionRow[] = submissions.map((entry) => {
      const data = (entry.data ?? {}) as Record<string, unknown>;
      const summary = Object.entries(data)
        .slice(0, 2)
        .map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`)
        .join(" · ");
      return {
        id: String(entry._id),
        editHref: `/admin/form-submissions/${entry._id}`,
        status: String(entry.status ?? "new"),
        locales: [defaultLocale],
        searchText: summary,
        values: {
          submittedAt: formatDate(entry._createdAt),
          status: String(entry.status ?? "new"),
          summary: summary || "—",
        },
      };
    });
    return { submissionRows, submissionCount: submissions.length };
  } catch {
    return { submissionRows: [], submissionCount: 0 };
  }
}

/** Resolve the parent form title shown on a form-submission detail page. */
export async function loadParentFormTitle(
  formId: string,
  cmsRuntime: CmsRuntime,
  runtimeContext: RuntimeContext,
): Promise<string | null> {
  try {
    const parentForm = (await cmsRuntime.forms.findOne({ _id: formId }, runtimeContext)) as Record<
      string,
      unknown
    > | null;
    if (!parentForm) return null;
    return String(parentForm.title ?? parentForm.slug ?? "");
  } catch {
    return null;
  }
}
