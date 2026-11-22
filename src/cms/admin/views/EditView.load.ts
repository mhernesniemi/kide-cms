import type { AiAction } from "../components/AiGenerateButton";
import config from "virtual:kide/config";
import { cms } from "virtual:kide/api";
import { isAiEnabled, collaboration } from "virtual:kide/runtime";
import { loadCollaborationData } from "../lib/collaboration";
import {
  formatDate,
  getFieldSets,
  getSharedBlockTypes,
  isApprover,
  languageName,
  resolveCollaboration,
  type LocaleState,
} from "../../core";
import {
  canDelete,
  canUpdate,
  canWrite,
  isFieldHidden as isFieldHiddenFn,
  isFieldReadOnly as isFieldReadOnlyFn,
} from "../lib/access";
import {
  loadDocument,
  loadLinkableCollections,
  canUseSharedSections,
  loadParentFormTitle,
  loadRelationLabels,
  loadRelationMeta,
  loadReverseRefs,
  loadSharedSectionOptions,
} from "../lib/edit-data";

import type { AdminUser } from "./types";

type CollectionLike = {
  slug: string;
  labels: { singular: string; plural: string };
  singleton?: boolean;
  drafts?: boolean;
  auth?: boolean;
  preview?: boolean | string;
  pathPrefix?: string | Record<string, string>;
  fields: Record<string, any>;
};

export type EditViewArgs = {
  collection: CollectionLike;
  mode: "new" | "edit";
  documentId?: string;
  // "editorial" = sticky bar + flowing fields (content collections & singletons);
  // "record" = plain header + card-wrapped fields (library/system collections).
  variant?: "editorial" | "record";
};

export async function loadEditView(
  url: URL,
  user: AdminUser,
  redirect: (path: string) => Response,
  workingLocale: string | undefined,
  { collection, mode, documentId, variant = "editorial" }: EditViewArgs,
) {
  const runtimeContext = user ? { user } : {};
  const cmsRuntime = cms as Record<string, any> & { meta: typeof cms.meta };
  const locales = config.locales?.supported ?? [];
  const defaultLocale = config.locales?.default ?? "en";
  const localeParam = url.searchParams.get("locale");
  const requestedLocale = localeParam && locales.includes(localeParam) ? localeParam : null;
  const aiEnabled = isAiEnabled();
  const collectionApi = cmsRuntime[collection.slug];
  const isSingleton = collection.singleton === true;

  const isFieldHidden = (fieldName: string) => isFieldHiddenFn(collection, user, fieldName);
  // A document the collection rules won't let this user change renders every field read-only
  const isFieldReadOnly = (fieldName: string) => !docEditable || isFieldReadOnlyFn(collection, user, fieldName);

  // --- Data loading ---
  let doc: Record<string, unknown> | null = null;
  let baseDoc: Record<string, unknown> | null = null;
  let versions: Array<{ version: number; createdAt: string }> = [];
  // The locale the base row is written in (`_sourceLocale`); its tab edits the
  // document itself, every other tab edits a translation overlay.
  let baseLocale = defaultLocale;
  let selectedLocale = requestedLocale ?? defaultLocale;
  if (mode === "edit" && documentId) {
    try {
      const loaded = await loadDocument(
        collectionApi,
        documentId,
        requestedLocale,
        defaultLocale,
        runtimeContext,
        workingLocale,
      );
      if (!loaded.doc) return redirect(`/admin/${collection.slug}`);
      doc = loaded.doc;
      baseDoc = loaded.baseDoc;
      baseLocale = loaded.baseLocale;
      selectedLocale = loaded.locale;
      versions = loaded.versions;
    } catch {
      return redirect(`/admin/${collection.slug}?_toast=error&_msg=Access+denied`);
    }
  }

  // Hide actions the access rules would refuse anyway: a document nobody may
  // edit (an ERP mirror, say) gets no Save, and Delete/Duplicate follow their rules
  const docEditable =
    mode === "new" ? canWrite(config, user, collection.slug) : canUpdate(config, user, collection.slug, doc);
  const canSave = Object.keys(collection.fields).some(
    (fieldName) => !isFieldHidden(fieldName) && !isFieldReadOnly(fieldName),
  );
  const canDeleteDoc = canDelete(config, user, collection.slug, doc);
  const canDuplicate = canWrite(config, user, collection.slug);

  const relationMetaByField = loadRelationMeta(collection, config, user);
  // Seed labels for the ids this document already points at, so relation fields
  // render named selections immediately instead of resolving them client-side.
  const relationLabelsByField = await loadRelationLabels(
    collection,
    doc,
    config,
    user,
    cmsRuntime,
    defaultLocale,
    runtimeContext,
  );
  const sharedBlockTypes = getSharedBlockTypes(config);
  const sharedSectionOptions = await loadSharedSectionOptions(config, user, cmsRuntime, defaultLocale, runtimeContext);
  const sharedSectionsAvailable = canUseSharedSections(config, user);
  // Menu trees and any link field (standalone or inside blocks) share the same
  // internal-document picker; it searches these collections on the server.
  const linkableCollections = loadLinkableCollections(config, user);
  const reverseRefs =
    mode === "edit" && documentId
      ? await loadReverseRefs(collection, documentId, config, user, cmsRuntime, defaultLocale, runtimeContext)
      : [];

  // Submissions live in their own sidebar section now, not as a tab on the form.
  const formTab = "edit" as "edit" | "submissions";

  // --- Form-submissions-specific: custom read-only view ---
  const isSubmissionView = collection.slug === "form-submissions" && mode === "edit";
  // Opening a new submission marks it read, like email. System write: the
  // read-only `data` field's access rule must not block the status flip.
  if (isSubmissionView && doc && documentId && doc.status === "new") {
    await collectionApi.update(documentId, { status: "read" }, { _system: true });
    doc.status = "read";
  }
  const parentFormTitle =
    isSubmissionView && doc?.form ? await loadParentFormTitle(String(doc.form), cmsRuntime, runtimeContext) : null;
  const submissionData = (isSubmissionView && doc?.data ? doc.data : {}) as Record<string, unknown>;
  const { _context: submissionContext, ...submittedFields } = submissionData;
  const submissionContextEntries =
    submissionContext && typeof submissionContext === "object"
      ? Object.entries(submissionContext as Record<string, unknown>)
      : [];
  const formatSubmissionValue = (value: unknown): string => {
    if (value === null || value === undefined) return "—";
    if (typeof value === "boolean") return value ? "Yes" : "No";
    if (typeof value === "string") return value;
    return JSON.stringify(value);
  };

  // --- Layout / derived state ---
  const translatableFields = Object.entries(collection.fields)
    .filter(([, field]: [string, any]) => field.translatable)
    .map(([fieldName]) => fieldName);
  const hasLocales = locales.length > 1 && translatableFields.length > 0;
  const translationMode = mode === "edit" && hasLocales && selectedLocale !== baseLocale;
  // Locales the document exists in: its content language plus every saved translation.
  const availableLocales = new Set(
    Array.isArray(baseDoc?._availableLocales) ? (baseDoc!._availableLocales as string[]) : [baseLocale],
  );
  const fieldSets = getFieldSets(collection);
  const primaryFieldSets = fieldSets.filter((set: { position?: string }) => set.position !== "sidebar");
  const sidebarFieldSets = fieldSets.filter((set: { position?: string }) => set.position === "sidebar");
  const mainFieldSets = primaryFieldSets.length > 0 ? primaryFieldSets : fieldSets.slice(0, 1);
  const effectiveSidebarFieldSets =
    sidebarFieldSets.length > 0 ? sidebarFieldSets : fieldSets.slice(mainFieldSets.length);

  // Document metadata (created/updated, scheduled publish) shown at the bottom of
  // the sidebar under the label info.
  const hasDocMeta = Boolean(mode === "edit" && doc && collection.drafts);

  // Editable fields that live in the sidebar (slug, category, etc.). The meta
  // group (Referenced by / Info) only draws a top divider when these exist above it.
  const hasSidebarFields =
    effectiveSidebarFieldSets.some((set) =>
      set.fields.some((fieldName) => collection.fields[fieldName] && !isFieldHidden(fieldName)),
    ) ||
    (hasLocales && mode === "new");
  const hasSidebarMeta = reverseRefs.length > 0 || hasDocMeta;

  // Whether to render the right-hand sidebar column at all (avoids a stray sticky
  // border on collections with no sidebar fields and no incoming references).
  const hasSidebarColumn = !isSubmissionView && (hasSidebarFields || hasSidebarMeta);

  const hasPreview = !!(mode === "edit" && (collection.preview || (collection.pathPrefix && doc?.slug)));
  // Live-preview channel key: the preview tab only listens to this document's editor.
  const previewKey = hasPreview && documentId ? `${collection.slug}:${documentId}` : null;
  const previewUrl =
    hasPreview && previewKey
      ? `${typeof collection.preview === "string" ? collection.preview : cms.meta.getRouteForDocument(collection.slug, doc, hasLocales ? selectedLocale : undefined)}?preview=${encodeURIComponent(previewKey)}`
      : null;

  // Per-language status of the document, from the base read (status "any").
  const localeStates = (baseDoc?._localeStates ?? {}) as Record<string, LocaleState | undefined>;
  const translationState = translationMode ? localeStates[selectedLocale] : undefined;
  const selectedLanguage = languageName(selectedLocale);
  const baseLanguage = languageName(baseLocale);
  // The translation's own values: an empty field is one that still falls back to the original.
  const ownTranslation: Record<string, unknown> =
    translationMode && documentId
      ? ((await collectionApi.getTranslations(documentId, runtimeContext))[selectedLocale] ?? {})
      : {};
  const isTranslatable = (fieldName: string) => Boolean(collection.fields[fieldName]?.translatable);
  const getSharedValue = (fieldName: string) => (baseDoc ? baseDoc[fieldName] : undefined);
  const getCurrentValue = (fieldName: string) => {
    if (!translationMode) return doc ? doc[fieldName] : undefined;
    return isTranslatable(fieldName) ? (ownTranslation[fieldName] ?? undefined) : getSharedValue(fieldName);
  };
  // Shared fields stay visible in a translation for context, edited only in the original.
  const isLocked = (fieldName: string) => isFieldReadOnly(fieldName) || (translationMode && !isTranslatable(fieldName));
  // An empty text or image field shows the original as its placeholder: what the site falls back to.
  const fieldFor = (fieldName: string) => {
    const field = collection.fields[fieldName];
    const plainText =
      (["text", "slug", "email"].includes(field.type) && !field.admin?.component) || field.type === "image";
    const original = getSharedValue(fieldName);
    if (!translationMode || !isTranslatable(fieldName) || !plainText || typeof original !== "string" || !original)
      return field;
    return { ...field, admin: { ...field.admin, placeholder: original } };
  };
  const aiActions = (fieldName: string): AiAction[] => {
    if (!aiEnabled || isLocked(fieldName)) return [];
    const field = collection.fields[fieldName];
    const actions: AiAction[] = [];
    const original = getSharedValue(fieldName);
    // Machine translation only makes sense for prose; ids, images and structured values stay as they are.
    const prose = field.type === "richText" || (field.type === "text" && !field.admin?.component);
    if (translationMode && isTranslatable(fieldName) && prose && original) {
      actions.push({
        label: `Translate from ${baseLanguage}`,
        endpoint: "/api/cms/ai/translate",
        payload: {
          text: typeof original === "object" ? JSON.stringify(original) : String(original),
          sourceLocale: baseLocale,
          targetLocale: selectedLocale,
          fieldName,
          fieldType: field.type === "richText" ? "richText" : "text",
        },
        targetField: fieldName,
      });
    }
    if (fieldName === "seoDescription") {
      actions.push({
        label: "Generate description",
        endpoint: "/api/cms/ai/seo",
        payload: { title: getCurrentValue("title") ?? "", excerpt: getCurrentValue("excerpt") ?? "" },
        targetField: fieldName,
      });
    }
    return actions;
  };

  // Editorial collaboration UI — shown only for collections in the collaboration
  // list, and only on normal document edits (not submissions or the translation form).
  const collab = resolveCollaboration(config, collection.slug);
  const showCollab = collab.enabled && mode === "edit" && !isSubmissionView && !translationMode;
  const collabData =
    showCollab && documentId
      ? await loadCollaborationData({
          collaboration,
          cmsRuntime,
          runtimeContext,
          collection: collection.slug,
          documentId,
          currentUser: user,
        })
      : null;

  // Publish gate: when collaboration.requireApproval is on, non-admins can't
  // publish a draft-enabled document until its review is approved. New documents
  // (no review yet) count as unapproved.
  const requireApproval = collab.enabled && collab.requireApproval && !!collection.drafts && !isSubmissionView;
  const publishBlocked =
    requireApproval && !isApprover(config, user?.role) && (collabData?.reviewState ?? "in_progress") !== "approved";

  const fieldView = Object.fromEntries(
    Object.keys(collection.fields).map((fieldName) => [
      fieldName,
      {
        hidden: isFieldHidden(fieldName),
        field: fieldFor(fieldName),
        value: getCurrentValue(fieldName),
        readOnly: isLocked(fieldName),
        aiActions: aiActions(fieldName),
      },
    ]),
  );
  const dateOrNull = (value: unknown) => (value ? formatDate(value as string) : null);

  return {
    href: {
      pathname: url.pathname,
      search: url.search,
      origin: url.origin,
      signInInvite: url.searchParams.get("signInInvite"),
      inviteToken: url.searchParams.get("inviteToken"),
      emailSent: url.searchParams.get("emailSent"),
    },
    collection: {
      slug: collection.slug,
      labels: collection.labels,
      singleton: collection.singleton,
      drafts: collection.drafts,
      auth: collection.auth,
      fields: collection.fields,
    },
    mode,
    documentId,
    variant,
    locales,
    isSingleton,
    doc,
    dates: {
      created: dateOrNull(doc?._createdAt),
      updated: dateOrNull(doc?._updatedAt),
      publishAt: dateOrNull(doc?._publishAt),
      unpublishAt: dateOrNull(doc?._unpublishAt),
      translationUpdated: dateOrNull(translationState?.updatedAt),
    },
    versions,
    baseLocale,
    selectedLocale,
    requestedLocale,
    localeStates,
    translationState,
    selectedLanguage,
    baseLanguage,
    fieldView,
    canSave,
    canDeleteDoc,
    canDuplicate,
    canApprove: isApprover(config, user?.role),
    colorPalette: config.admin?.colors ?? [],
    relationMetaByField,
    relationLabelsByField,
    sharedBlockTypes,
    sharedSectionOptions,
    sharedSectionsAvailable,
    linkableCollections,
    reverseRefs,
    formTab,
    isSubmissionView,
    parentFormTitle,
    submissionRows: [...Object.entries(submittedFields), ...submissionContextEntries].map(
      ([key, value]) => [key, formatSubmissionValue(value)] as const,
    ),
    hasLocales,
    translationMode,
    availableLocaleCount: availableLocales.size,
    mainFieldSets,
    effectiveSidebarFieldSets,
    hasDocMeta,
    hasSidebarFields,
    hasSidebarMeta,
    hasSidebarColumn,
    hasPreview,
    previewKey,
    previewUrl,
    showCollab,
    collabData,
    publishBlocked,
  };
}
