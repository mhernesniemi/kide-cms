import { Fragment } from "react";
import { Archive, ArrowUpRight, Dot, Lock } from "lucide-react";

import { AdminCard } from "../components/AdminCard";
import AiFieldActions from "../components/AiFieldActions";
import type { AiAction } from "../components/AiGenerateButton";
import CollaborationReviewBar from "../components/CollaborationReviewBar";
import DocumentActions from "../components/DocumentActions";
import DocumentLock from "../components/DocumentLock";
import LiveHeading from "../components/LiveHeading";
import UnsavedGuard from "../components/UnsavedGuard";
import { FieldControl } from "../components/FieldControl";
import { LanguageSwitcher } from "../components/LanguageSwitcher";
import TranslationActions from "../components/TranslationActions";
import SelectField from "../components/SelectField";
import { StatusBadge } from "../components/ui/badge";
import { buttonVariants } from "../components/ui/button";
import config from "virtual:kide/config";
import { cms } from "virtual:kide/api";
import { isAiEnabled, collaboration } from "virtual:kide/runtime";
import { loadCollaborationData } from "../lib/collaboration";
import {
  formatDate,
  getFieldGroups,
  getFieldSets,
  getLabelField,
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
  getFormAction,
  getVisualStatus,
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
import { EditScripts } from "./edit/EditScripts";
import { ReverseReferencesList } from "./edit/ReverseReferencesList";

import { Island } from "../render/island";
import { cn } from "../lib/utils";
import { workingLocaleCookie } from "../lib/locale";
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

  return {
    url,
    user,
    collection,
    mode,
    documentId,
    variant,
    locales,
    isSingleton,
    isFieldHidden,
    isFieldReadOnly,
    doc,
    versions,
    baseLocale,
    selectedLocale,
    requestedLocale,
    localeStates,
    translationState,
    selectedLanguage,
    baseLanguage,
    isLocked,
    fieldFor,
    aiActions,
    canSave,
    canDeleteDoc,
    canDuplicate,
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
    submittedFields,
    submissionContextEntries,
    formatSubmissionValue,
    hasLocales,
    translationMode,
    availableLocales,
    mainFieldSets,
    effectiveSidebarFieldSets,
    hasDocMeta,
    hasSidebarFields,
    hasSidebarMeta,
    hasSidebarColumn,
    hasPreview,
    previewKey,
    previewUrl,
    getCurrentValue,
    showCollab,
    collabData,
    publishBlocked,
  };
}

export type EditViewData = Exclude<Awaited<ReturnType<typeof loadEditView>>, Response>;

export function EditView(props: EditViewData) {
  const {
    url,
    user,
    collection,
    mode,
    documentId,
    variant,
    locales,
    isSingleton,
    isFieldHidden,
    doc,
    versions,
    baseLocale,
    selectedLocale,
    requestedLocale,
    localeStates,
    translationState,
    selectedLanguage,
    baseLanguage,
    isLocked,
    fieldFor,
    aiActions,
    canSave,
    canDeleteDoc,
    canDuplicate,
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
    submittedFields,
    submissionContextEntries,
    formatSubmissionValue,
    hasLocales,
    translationMode,
    availableLocales,
    mainFieldSets,
    effectiveSidebarFieldSets,
    hasDocMeta,
    hasSidebarFields,
    hasSidebarMeta,
    hasSidebarColumn,
    hasPreview,
    previewKey,
    previewUrl,
    getCurrentValue,
    showCollab,
    collabData,
    publishBlocked,
  } = props;
  const labelActions = (fieldName: string) => {
    const actions = aiActions(fieldName);
    return actions.length > 0 ? (
      <Island name="AiFieldActions" component={AiFieldActions} props={{ actions }} />
    ) : undefined;
  };
  return (
    <>
      <section className="space-y-14">
        {/* ── Sticky action bar ─────────────────────────────────────────────────
     Title + status on the left, primary actions on the right. Stays pinned so
     Save / Publish stay reachable while editing long documents. */}
        <div
          className={cn(
            "border-b px-4 py-3 lg:py-4 lg:pr-8 lg:pl-8",
            variant === "editorial" && "bg-background sticky top-0 z-30 backdrop-blur-md",
          )}
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2.5" data-kide-refresh="title">
                <h1 className="truncate text-lg font-semibold tracking-tight md:text-xl">
                  {mode === "new" && (
                    <Island
                      name="LiveHeading"
                      component={LiveHeading}
                      props={{ initial: `New ${collection.labels.singular}` }}
                    />
                  )}
                  {mode === "edit" && (
                    <Island
                      name="LiveHeading"
                      component={LiveHeading}
                      props={{
                        initial: collection.singleton
                          ? collection.labels.singular
                          : String(doc?.[getLabelField(collection)] ?? doc?.slug ?? collection.labels.singular),
                      }}
                    />
                  )}
                </h1>
                {mode === "edit" && doc && translationMode
                  ? (collection.drafts || !translationState) && (
                      <StatusBadge status={translationState?.status ?? "not translated"} styled />
                    )
                  : mode === "edit" && doc && collection.drafts && <StatusBadge status={getVisualStatus(doc)} styled />}
              </div>
              {isSubmissionView && doc && (
                <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-1 text-xs">
                  {parentFormTitle && <span>{parentFormTitle}</span>}
                  {parentFormTitle && <Dot className="text-muted-foreground/70 size-4" />}
                  <span>Submitted {formatDate(String(doc._createdAt ?? ""))}</span>
                </div>
              )}
            </div>

            {formTab !== "submissions" && (
              <div
                className="flex flex-wrap items-center gap-2 sm:flex-shrink-0 sm:justify-end"
                data-kide-refresh="actions"
              >
                {hasPreview && previewUrl && (
                  <>
                    <a href={previewUrl} target="_blank" className={buttonVariants({ variant: "outline" })}>
                      Preview
                      <ArrowUpRight className="size-4" />
                    </a>
                    <div className="bg-border mx-1 h-6 w-px" />
                  </>
                )}
                {hasLocales && mode === "edit" && (
                  <>
                    <LanguageSwitcher
                      locales={locales}
                      selected={selectedLocale}
                      baseLocale={baseLocale}
                      states={localeStates}
                      hrefFor={(locale: string) => `/admin/${collection.slug}/${documentId}?locale=${locale}`}
                    />
                    <div className="bg-border mx-1 h-6 w-px" />
                  </>
                )}
                {isSubmissionView && documentId ? (
                  <form method="post" action={getFormAction(collection.slug, documentId)}>
                    <input type="hidden" name="_action" value="update" />
                    <input type="hidden" name="status" value={doc?.status === "archived" ? "read" : "archived"} />
                    <input type="hidden" name="redirectTo" value={`/admin/${collection.slug}`} />
                    <button className={buttonVariants({ variant: "outline" })} type="submit">
                      <Archive className="size-3.5" />
                      {doc?.status === "archived" ? "Unarchive" : "Archive"}
                    </button>
                  </form>
                ) : (
                  <>
                    {canSave && (
                      <button
                        className={buttonVariants({ variant: "outline" })}
                        type="submit"
                        form="document-form"
                        name="_intent"
                        value="save"
                        disabled={mode === "edit"}
                      >
                        {collection.slug === "users" && mode === "new"
                          ? "Send invite"
                          : collection.drafts
                            ? "Save draft"
                            : "Save"}
                      </button>
                    )}
                    {collection.drafts &&
                      (publishBlocked ? (
                        <button
                          className={buttonVariants({ variant: "outline" })}
                          type="button"
                          disabled
                          title="Publish unlocks once the review is approved"
                        >
                          <Lock className="size-3.5" />
                          Needs approval
                        </button>
                      ) : (
                        <button
                          className={buttonVariants({ variant: "publish" })}
                          type="submit"
                          form="document-form"
                          name="_intent"
                          value="publish"
                          disabled={
                            mode === "edit" &&
                            (translationMode
                              ? !(translationState?.status === "draft" || translationState?.status === "changed")
                              : !(
                                  doc?._status === "draft" ||
                                  doc?._status === "scheduled" ||
                                  (doc && getVisualStatus(doc) === "changed")
                                ))
                          }
                        >
                          Publish
                        </button>
                      ))}
                  </>
                )}
                {mode === "edit" && !translationMode && documentId && (
                  <Island
                    name="DocumentActions"
                    component={DocumentActions}
                    props={{
                      formId: "document-form",
                      collectionSlug: collection.slug,
                      documentId,
                      showUnpublish: collection.drafts && doc?._status === "published",
                      showDiscardDraft: Boolean(collection.drafts && doc?._status === "published" && doc?._published),
                      showDelete: !isSingleton && canDeleteDoc,
                      showDuplicate: !isSingleton && !collection.auth && canDuplicate,
                      showSchedule: !!collection.drafts,
                      showCancelSchedule: collection.drafts && doc?._status === "scheduled",
                      currentPublishAt: doc?._publishAt ? String(doc._publishAt) : undefined,
                      currentUnpublishAt: doc?._unpublishAt ? String(doc._unpublishAt) : undefined,
                      versions,
                      // Only while the document exists in one language: a translation would
                      languages:
                        // collide with the new original language, so the API refuses the change.
                        hasLocales && availableLocales.size === 1
                          ? locales.map((locale) => ({ value: locale, label: languageName(locale) }))
                          : undefined,
                      contentLanguage: baseLocale,
                      restoreEndpoint: getFormAction(collection.slug, documentId),
                      redirectTo: url.pathname + url.search,
                    }}
                  />
                )}
                {translationMode && translationState && canSave && (
                  <Island
                    name="TranslationActions"
                    component={TranslationActions}
                    props={{
                      formId: "document-form",
                      language: selectedLanguage,
                      showUnpublish: Boolean(
                        collection.drafts &&
                        (translationState.status === "published" || translationState.status === "changed"),
                      ),
                      showDiscard: translationState.status === "changed",
                    }}
                  />
                )}
              </div>
            )}
          </div>
        </div>

        {/* Body — everything below the sticky bar, inset from the page edges */}
        <div className="space-y-6 px-4 pb-8 lg:px-8 lg:pb-12 2xl:px-20">
          {/* Collaboration review strip. Margins live on this wrapper, which only
        renders when collaboration is enabled, so non-collab edit views are
        untouched. The body already sits 3.5rem (section space-y-14) below the
        header, so -mt-6 trims the top gap to ~2rem and mb-8 balances the bottom.
        lg:-ml-12 pulls it to the header's left edge (full width). */}
          {showCollab && collabData && documentId && (
            <div className="-mt-6 mb-8 2xl:-mx-8" data-kide-refresh="collab">
              <Island
                name="CollaborationReviewBar"
                component={CollaborationReviewBar}
                props={{
                  collection: collection.slug,
                  documentId,
                  reviewState: collabData.reviewState,
                  editor: collabData.editor,
                  assignableUsers: collabData.assignableUsers,
                  comments: collabData.comments,
                  activity: collabData.activity,
                  currentUser: collabData.currentUser,
                  canApprove: isApprover(config, user?.role),
                }}
              />
            </div>
          )}
          {formTab !== "submissions" && (
            <>
              {mode === "edit" && documentId && (
                <Island
                  name="DocumentLock"
                  component={DocumentLock}
                  props={{ collection: collection.slug, documentId }}
                />
              )}
              <div className="contents" data-kide-refresh="guard">
                <Island
                  name="UnsavedGuard"
                  component={UnsavedGuard}
                  props={{
                    formId: "document-form",
                    isNew: mode === "new",
                    isDraft: Boolean(
                      collection.drafts &&
                      (translationMode
                        ? translationState?.status === "draft" || translationState?.status === "changed"
                        : doc?._status === "draft" ||
                          doc?._status === "scheduled" ||
                          (doc && getVisualStatus(doc) === "changed")),
                    ),
                  }}
                />
              </div>
              <div id="document-edit-area" data-preview-channel={previewKey ?? undefined}>
                {collection.slug === "users" && mode === "edit" && url.searchParams.get("signInInvite") && (
                  <AdminCard title={url.searchParams.get("emailSent") === "true" ? "Invitation sent" : "Sign-in link"}>
                    <p className="text-muted-foreground text-sm">
                      {url.searchParams.get("emailSent") === "true"
                        ? "An invitation email has been sent. They sign in with single sign-on here:"
                        : "Email is not configured. Share this link — they sign in with single sign-on:"}
                    </p>
                    <code className="bg-muted mt-2 block rounded-md px-3 py-2 text-sm break-all select-all">
                      {url.origin}/admin/login
                    </code>
                  </AdminCard>
                )}
                {collection.slug === "users" && mode === "edit" && url.searchParams.get("inviteToken") && (
                  <AdminCard title={url.searchParams.get("emailSent") === "true" ? "Invitation sent" : "Invite link"}>
                    {url.searchParams.get("emailSent") === "true" ? (
                      <p className="text-muted-foreground text-sm">
                        An invitation email has been sent. The user can also use this link:
                      </p>
                    ) : (
                      <p className="text-muted-foreground text-sm">
                        Email is not configured. Share this link with the user to complete their registration:
                      </p>
                    )}
                    <code className="bg-muted mt-2 block rounded-md px-3 py-2 text-sm break-all select-all">
                      {url.origin}/admin/invite?token={url.searchParams.get("inviteToken")}
                    </code>
                  </AdminCard>
                )}

                {
                  <form
                    id="document-form"
                    method="post"
                    action={getFormAction(collection.slug, mode === "edit" ? documentId : undefined)}
                    className={cn(
                      "grid items-start gap-y-10",
                      hasSidebarColumn
                        ? "gap-x-8 lg:grid-cols-[minmax(0,1fr)_minmax(320px,400px)] 2xl:gap-x-20"
                        : "max-w-3xl",
                    )}
                  >
                    <input
                      type="hidden"
                      name="_action"
                      value={translationMode ? "save-translation" : mode === "new" ? "create" : "update"}
                    />
                    {translationMode && <input type="hidden" name="locale" value={selectedLocale} />}
                    <input type="hidden" name="redirectTo" value={url.pathname + url.search} />

                    <div className="min-w-0 space-y-7">
                      {translationState?.outdated && (
                        <div className="flex items-center justify-between gap-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-800 dark:text-amber-300">
                          <p>The {baseLanguage} original has changed since this translation was saved.</p>
                          <button
                            type="submit"
                            name="_action"
                            value="confirm-translation"
                            className="shrink-0 underline underline-offset-2 hover:no-underline"
                          >
                            Mark as up to date
                          </button>
                        </div>
                      )}
                      {isSubmissionView ? (
                        <AdminCard title="Submission">
                          <table className="w-full text-sm">
                            <tbody>
                              {Object.entries(submittedFields).map(([key, value]) => (
                                <tr key={key} className="border-b last:border-b-0">
                                  <td className="text-muted-foreground w-1/3 py-2 pr-4 align-top font-medium">{key}</td>
                                  <td className="py-2 align-top break-words whitespace-pre-wrap">
                                    {formatSubmissionValue(value)}
                                  </td>
                                </tr>
                              ))}
                              {submissionContextEntries.map(([key, value]) => (
                                <tr key={key} className="border-b last:border-b-0">
                                  <td className="text-muted-foreground w-1/3 py-2 pr-4 align-top font-medium">{key}</td>
                                  <td className="py-2 align-top break-words whitespace-pre-wrap">
                                    {formatSubmissionValue(value)}
                                  </td>
                                </tr>
                              ))}
                              {Object.keys(submittedFields).length === 0 && submissionContextEntries.length === 0 && (
                                <tr>
                                  <td className="text-muted-foreground py-2" colSpan={2}>
                                    No data.
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </AdminCard>
                      ) : (
                        mainFieldSets.map((set, setIndex) => {
                          const visibleFields = set.fields.filter(
                            (fieldName) => collection.fields[fieldName] && !isFieldHidden(fieldName),
                          );
                          const renderField = (fieldName: string) => (
                            <FieldControl
                              key={fieldName}
                              name={fieldName}
                              field={fieldFor(fieldName)}
                              value={getCurrentValue(fieldName)}
                              readOnly={isLocked(fieldName)}
                              labelActions={labelActions(fieldName)}
                              relationMeta={relationMetaByField[fieldName]}
                              relationOptions={relationLabelsByField[fieldName] ?? []}
                              linkableCollections={linkableCollections}
                              sharedBlockTypes={sharedBlockTypes}
                              sharedSectionOptions={sharedSectionOptions}
                              sharedSectionsAvailable={sharedSectionsAvailable}
                            />
                          );
                          const fields = (
                            <div className={cn("grid", variant === "record" ? "gap-6" : "gap-8")}>
                              {getFieldGroups(collection, visibleFields).map((run, runIndex) =>
                                run.group && run.collapsible ? (
                                  <details
                                    key={runIndex}
                                    className="group/fieldset overflow-hidden rounded-lg border"
                                    open={run.collapsible !== "collapsed"}
                                    data-fieldset-key={`${collection.slug}:${run.group}`}
                                  >
                                    <summary className="bg-muted-strong/70 text-foreground/80 hover:bg-muted-strong/90 flex items-center justify-between px-4 py-2.5 text-sm font-medium transition-colors select-none group-open/fieldset:border-b [&::-webkit-details-marker]:hidden [&::marker]:content-none">
                                      {run.group}
                                      <svg
                                        width="16"
                                        height="16"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        className="text-muted-foreground transition-transform group-open/fieldset:rotate-90"
                                        aria-hidden="true"
                                      >
                                        <path d="m9 18 6-6-6-6" />
                                      </svg>
                                    </summary>
                                    <div className="grid gap-6 p-4">{run.fields.map(renderField)}</div>
                                  </details>
                                ) : run.group ? (
                                  <section key={runIndex} className="overflow-hidden rounded-lg border">
                                    <h3 className="bg-muted-strong/70 text-foreground/80 border-b px-4 py-2.5 text-sm font-medium">
                                      {run.group}
                                    </h3>
                                    <div className="grid gap-6 p-4">{run.fields.map(renderField)}</div>
                                  </section>
                                ) : (
                                  <Fragment key={runIndex}>{run.fields.map(renderField)}</Fragment>
                                ),
                              )}
                            </div>
                          );
                          return variant === "record" ? (
                            <AdminCard key={setIndex} title={collection.labels.singular}>
                              {fields}
                            </AdminCard>
                          ) : (
                            <Fragment key={setIndex}>{fields}</Fragment>
                          );
                        })
                      )}
                    </div>

                    {hasSidebarColumn && (
                      <div className="text-sm lg:border-l lg:pl-8 [&_button]:text-sm [&_input]:text-sm [&_select]:text-sm [&_textarea]:text-sm">
                        <div className="space-y-6">
                          {effectiveSidebarFieldSets.map((set, setIndex) => {
                            const fields = (
                              <div className="grid gap-6">
                                {set.fields
                                  .filter((fieldName) => collection.fields[fieldName] && !isFieldHidden(fieldName))
                                  .map((fieldName) => (
                                    <div key={fieldName}>
                                      <FieldControl
                                        name={fieldName}
                                        field={fieldFor(fieldName)}
                                        value={getCurrentValue(fieldName)}
                                        readOnly={isLocked(fieldName)}
                                        labelActions={labelActions(fieldName)}
                                        relationMeta={relationMetaByField[fieldName]}
                                        relationOptions={relationLabelsByField[fieldName] ?? []}
                                        linkableCollections={linkableCollections}
                                        sharedBlockTypes={sharedBlockTypes}
                                        sharedSectionOptions={sharedSectionOptions}
                                        sharedSectionsAvailable={sharedSectionsAvailable}
                                      />
                                    </div>
                                  ))}
                              </div>
                            );
                            return variant === "record" ? (
                              <AdminCard key={setIndex} title="Settings">
                                {fields}
                              </AdminCard>
                            ) : (
                              <Fragment key={setIndex}>{fields}</Fragment>
                            );
                          })}
                          {/* The language is chosen when the document is created; afterwards the
                          top switcher is the one language control (changing it later lives
                          in the ⋯ menu, offered only while no translation exists). */}
                          {hasLocales && mode === "new" && !isSubmissionView && (
                            <div className="grid gap-1.5">
                              <label
                                htmlFor="_sourceLocale"
                                className="text-foreground/80 text-sm leading-none font-medium"
                              >
                                Language
                              </label>
                              <Island
                                name="SelectField"
                                component={SelectField}
                                props={{
                                  name: "_sourceLocale",
                                  value: baseLocale,
                                  placeholder: "Select a language",
                                  items: locales.map((locale) => ({ value: locale, label: languageName(locale) })),
                                }}
                              />
                              <p className="text-muted-foreground text-xs">
                                The language this document is written in. Translations can be added after saving.
                              </p>
                            </div>
                          )}
                          {hasSidebarMeta && (
                            <div
                              data-kide-refresh="meta"
                              className={cn(
                                variant === "record" ? "space-y-6" : "grid gap-6",
                                variant !== "record" && hasSidebarFields && "border-t pt-6",
                              )}
                            >
                              <ReverseReferencesList reverseRefs={reverseRefs} variant={variant} />
                              {hasDocMeta &&
                                doc &&
                                (() => {
                                  const meta = (
                                    <dl className="text-muted-foreground grid gap-1 text-xs">
                                      {doc._status === "scheduled" && Boolean(doc._publishAt) && (
                                        <>
                                          <div className="flex gap-2 lg:justify-between">
                                            <dt>Publishes</dt>
                                            <dd className="text-foreground/70">{formatDate(doc._publishAt)}</dd>
                                          </div>
                                          {Boolean(doc._unpublishAt) && (
                                            <div className="flex gap-2 lg:justify-between">
                                              <dt>Unpublishes</dt>
                                              <dd className="text-foreground/70">{formatDate(doc._unpublishAt)}</dd>
                                            </div>
                                          )}
                                        </>
                                      )}
                                      <div className="flex gap-2 lg:justify-between">
                                        <dt>Created</dt>
                                        <dd className="text-foreground/70">{formatDate(doc._createdAt)}</dd>
                                      </div>
                                      <div className="flex gap-2 lg:justify-between">
                                        <dt>{translationMode ? `${selectedLanguage} updated` : "Updated"}</dt>
                                        <dd className="text-foreground/70">
                                          {formatDate(translationMode ? translationState?.updatedAt : doc._updatedAt)}
                                        </dd>
                                      </div>
                                    </dl>
                                  );

                                  return variant === "record" ? (
                                    <AdminCard title="Info">{meta}</AdminCard>
                                  ) : (
                                    <div className={cn("grid gap-2", reverseRefs.length > 0 && "border-t pt-6")}>
                                      <span className="text-foreground/80 text-sm leading-none font-medium">Info</span>
                                      {meta}
                                    </div>
                                  );
                                })()}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </form>
                }
              </div>
            </>
          )}
        </div>
      </section>
      <EditScripts />
      {requestedLocale && hasLocales && (
        <script
          dangerouslySetInnerHTML={{
            __html: `document.cookie=${JSON.stringify(workingLocaleCookie(requestedLocale))};`,
          }}
        />
      )}
    </>
  );
}
