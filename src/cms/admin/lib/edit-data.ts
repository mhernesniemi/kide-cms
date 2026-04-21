import { getLabelField } from "@/cms/core";
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
      const relatedDocs = await cmsRuntime[field.collection].find(
        { status: "any", limit: 100, sort: { field: "_updatedAt", direction: "desc" }, locale: defaultLocale },
        runtimeContext,
      );
      const relatedCollection = config.collections.find((c: any) => c.slug === field.collection);
      const relLabelField = relatedCollection ? getLabelField(relatedCollection) : "title";
      relationOptionsByField[fieldName] = relatedDocs.map((item: Record<string, unknown>) => ({
        value: String(item._id),
        label: String(item[relLabelField] ?? item.slug ?? item._id),
      }));
      if (relatedCollection) {
        relationMetaByField[fieldName] = {
          collectionSlug: field.collection,
          collectionLabel: relatedCollection.labels.singular,
          hasMany: field.hasMany ?? false,
          labelField: getLabelField(relatedCollection),
        };
      }
    }
    if (field.type === "blocks" && field.types) {
      for (const [typeName, typeFields] of Object.entries(field.types)) {
        for (const [subFieldName, subField] of Object.entries(typeFields as Record<string, any>) as [string, any][]) {
          if (subField.type === "relation" && canRead(config, user, subField.collection)) {
            const key = `block:${typeName}:${subFieldName}`;
            if (!relationOptionsByField[key]) {
              const relatedDocs = await cmsRuntime[subField.collection].find(
                { status: "any", limit: 100, sort: { field: "_updatedAt", direction: "desc" }, locale: defaultLocale },
                runtimeContext,
              );
              const blkRelCol = config.collections.find((c: any) => c.slug === subField.collection);
              const blkLabelField = blkRelCol ? getLabelField(blkRelCol) : "title";
              relationOptionsByField[key] = relatedDocs.map((item: Record<string, unknown>) => ({
                value: String(item._id),
                label: String(item[blkLabelField] ?? item.slug ?? item._id),
              }));
            }
          }
        }
      }
    }
  }

  return { relationOptionsByField, relationMetaByField };
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
              collectionLabel: otherCollection.labels.plural,
              collectionSlug: otherCollection.slug,
              docs: matched.map((r: Record<string, unknown>) => ({
                _id: String(r._id),
                label: String(r[otherLabelField] ?? r.slug ?? r._id),
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
              collectionLabel: otherCollection.labels.plural,
              collectionSlug: otherCollection.slug,
              docs: refs.map((r: Record<string, unknown>) => ({
                _id: String(r._id),
                label: String(r[otherLabelField] ?? r.slug ?? r._id),
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
