import {
  SHARED_SECTIONS_COLLECTION,
  extractSharedSectionRefsFromDocument,
  getLabelField,
  getSharedBlockTypes,
  type SharedSectionOption,
} from "@/cms/core";
import { canRead } from "./access";

type User = { id: string; role?: string; email?: string } | null | undefined;
type CmsRuntime = Record<string, any> & { meta: { getRouteForDocument: (slug: string, doc: any) => string } };
type RuntimeContext = Record<string, unknown>;
type CollectionLike = { slug: string; fields: Record<string, any> };

type LoadedDocument = {
  doc: Record<string, unknown> | null;
  baseDoc: Record<string, unknown> | null;
  versions: Array<{ version: number; createdAt: string }>;
};

/** Load the primary doc, base-locale doc (for translation source), and versions list. */
export async function loadDocument(
  collectionApi: any,
  documentId: string,
  requestedLocale: string,
  defaultLocale: string,
  runtimeContext: RuntimeContext,
): Promise<LoadedDocument> {
  const doc = await collectionApi.findById(documentId, { status: "any", locale: requestedLocale }, runtimeContext);
  if (!doc) return { doc: null, baseDoc: null, versions: [] };
  const baseDoc =
    requestedLocale === defaultLocale
      ? doc
      : await collectionApi.findById(documentId, { status: "any", locale: defaultLocale }, runtimeContext);
  const versions = await collectionApi.versions(documentId);
  return { doc, baseDoc, versions };
}

export type RelationMeta = {
  collectionSlug: string;
  collectionLabel: string;
  hasMany: boolean;
  labelField?: string;
};

export type RelationOptions = {
  relationOptionsByField: Record<string, Array<{ value: string; label: string }>>;
  relationMetaByField: Record<string, RelationMeta>;
};

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

/** Fetch relation option lists for top-level relation fields and any relations nested inside blocks. */
export async function loadRelationOptions(
  collection: CollectionLike,
  config: any,
  user: User,
  cmsRuntime: CmsRuntime,
  defaultLocale: string,
  runtimeContext: RuntimeContext,
): Promise<RelationOptions> {
  const relationOptionsByField: Record<string, Array<{ value: string; label: string }>> = {};
  const relationMetaByField: Record<string, RelationMeta> = {};

  for (const [fieldName, field] of Object.entries(collection.fields) as [string, any][]) {
    if (field.type === "relation" && canRead(config, user, field.collection)) {
      const relatedCollection = config.collections.find((c: any) => c.slug === field.collection);
      relationOptionsByField[fieldName] = await loadRelationOptionList(
        field.collection,
        config,
        cmsRuntime,
        defaultLocale,
        runtimeContext,
      );
      if (relatedCollection) {
        relationMetaByField[fieldName] = {
          collectionSlug: field.collection,
          collectionLabel: relatedCollection.labels.singular,
          hasMany: field.hasMany ?? false,
          labelField: getLabelField(relatedCollection),
        };
      }
    }
    // Relations nested inside block types — both standalone `blocks` fields and inline
    // blocks in a `content` field use the same `block:<field>:<type>:<subField>` key scheme.
    // The parent field name keeps two block-bearing fields that share a block-type name
    // (but target different collections) from colliding.
    const blockTypes = field.type === "blocks" ? field.types : field.type === "content" ? field.blocks : null;
    if (blockTypes) {
      for (const [typeName, typeFields] of Object.entries(blockTypes)) {
        for (const [subFieldName, subField] of Object.entries(typeFields as Record<string, any>) as [string, any][]) {
          if (subField.type === "relation" && canRead(config, user, subField.collection)) {
            const key = `block:${fieldName}:${typeName}:${subFieldName}`;
            if (!relationOptionsByField[key]) {
              relationOptionsByField[key] = await loadRelationOptionList(
                subField.collection,
                config,
                cmsRuntime,
                defaultLocale,
                runtimeContext,
              );
            }
          }
        }
      }
    }
  }

  return { relationOptionsByField, relationMetaByField };
}

export async function loadSharedBlockRelationOptions(
  config: any,
  user: User,
  cmsRuntime: CmsRuntime,
  defaultLocale: string,
  runtimeContext: RuntimeContext,
): Promise<Record<string, Array<{ value: string; label: string }>>> {
  const relationOptions: Record<string, Array<{ value: string; label: string }>> = {};
  const sharedBlockTypes = getSharedBlockTypes(config);

  for (const [typeName, typeFields] of Object.entries(sharedBlockTypes)) {
    for (const [fieldName, field] of Object.entries(typeFields) as [string, any][]) {
      if (field.type !== "relation" || !canRead(config, user, field.collection)) continue;
      relationOptions[`shared:${typeName}:${fieldName}`] = await loadRelationOptionList(
        field.collection,
        config,
        cmsRuntime,
        defaultLocale,
        runtimeContext,
      );
    }
  }

  return relationOptions;
}

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

export type MenuLinkGroup = {
  collection: string;
  label: string;
  items: Array<{ id: string; label: string; href: string }>;
};

/** For menu editing: list linkable published documents across content collections. */
export async function loadMenuLinkOptions(
  config: any,
  user: User,
  cmsRuntime: CmsRuntime,
  defaultLocale: string,
  runtimeContext: RuntimeContext,
): Promise<MenuLinkGroup[]> {
  const linkableCollections = config.collections.filter(
    (c: any) =>
      !c.singleton &&
      !["users", "menus", "taxonomies", "authors"].includes(c.slug) &&
      c.fields.slug &&
      canRead(config, user, c.slug),
  );
  const menuLinkOptions: MenuLinkGroup[] = [];
  for (const lc of linkableCollections) {
    const lcApi = cmsRuntime[lc.slug];
    const lcDocs = await lcApi.find(
      { status: "published", limit: 200, sort: { field: "_updatedAt", direction: "desc" }, locale: defaultLocale },
      runtimeContext,
    );
    menuLinkOptions.push({
      collection: lc.slug,
      label: lc.labels.plural,
      items: lcDocs.map((d: Record<string, unknown>) => ({
        id: String(d._id),
        label: String(d[getLabelField(lc)] ?? d.slug ?? d._id),
        href: cmsRuntime.meta.getRouteForDocument(lc.slug, d),
      })),
    });
  }
  return menuLinkOptions;
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
    const parentForm = (await cmsRuntime.forms.findOne({ where: { _id: formId } }, runtimeContext)) as Record<
      string,
      unknown
    > | null;
    if (!parentForm) return null;
    return String(parentForm.title ?? parentForm.slug ?? "");
  } catch {
    return null;
  }
}
