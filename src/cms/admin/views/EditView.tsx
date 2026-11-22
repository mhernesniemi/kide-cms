import { Fragment, useEffect } from "react";
import { Archive, ArrowUpRight, Dot, Lock } from "lucide-react";

import { AdminCard } from "../components/AdminCard";
import AiFieldActions from "../components/AiFieldActions";
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
import { getFieldGroups, languageName } from "../../core/admin";
import { getLabelField } from "../../core/define";
import { getFormAction, getVisualStatus } from "../lib/access";
import { workingLocaleCookie } from "../lib/locale";
import { cn } from "../lib/utils";
import { Island } from "../render/island";
import { EditScripts } from "./edit/EditScripts";
import { ReverseReferencesList } from "./edit/ReverseReferencesList";
import type { loadEditView } from "./EditView.load";

// Remembers the language the editor opened, so lists and documents default to it.
function WorkingLocale({ locale }: { locale: string }) {
  useEffect(() => {
    document.cookie = workingLocaleCookie(locale);
  }, [locale]);
  return null;
}

export type EditViewData = Exclude<Awaited<ReturnType<typeof loadEditView>>, Response>;
type FieldViewEntry = EditViewData["fieldView"][string];

export function EditView(props: EditViewData) {
  const {
    href,
    collection,
    mode,
    documentId,
    variant,
    locales,
    isSingleton,
    doc,
    dates,
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
    canApprove,
    colorPalette,
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
    submissionRows,
    hasLocales,
    translationMode,
    availableLocaleCount,
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
  } = props;
  const isVisible = (fieldName: string) => Boolean(fieldView[fieldName] && !fieldView[fieldName].hidden);
  const labelActions = ({ aiActions: actions }: FieldViewEntry) => {
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
                  <span>Submitted {dates.created}</span>
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
                        hasLocales && availableLocaleCount === 1
                          ? locales.map((locale) => ({ value: locale, label: languageName(locale) }))
                          : undefined,
                      contentLanguage: baseLocale,
                      restoreEndpoint: getFormAction(collection.slug, documentId),
                      redirectTo: href.pathname + href.search,
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
                  canApprove,
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
              <div className="contents" data-kide-refresh="guard" key={String(doc?._updatedAt ?? mode)}>
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
                {collection.slug === "users" && mode === "edit" && href.signInInvite && (
                  <AdminCard title={href.emailSent === "true" ? "Invitation sent" : "Sign-in link"}>
                    <p className="text-muted-foreground text-sm">
                      {href.emailSent === "true"
                        ? "An invitation email has been sent. They sign in with single sign-on here:"
                        : "Email is not configured. Share this link — they sign in with single sign-on:"}
                    </p>
                    <code className="bg-muted mt-2 block rounded-md px-3 py-2 text-sm break-all select-all">
                      {href.origin}/admin/login
                    </code>
                  </AdminCard>
                )}
                {collection.slug === "users" && mode === "edit" && href.inviteToken && (
                  <AdminCard title={href.emailSent === "true" ? "Invitation sent" : "Invite link"}>
                    {href.emailSent === "true" ? (
                      <p className="text-muted-foreground text-sm">
                        An invitation email has been sent. The user can also use this link:
                      </p>
                    ) : (
                      <p className="text-muted-foreground text-sm">
                        Email is not configured. Share this link with the user to complete their registration:
                      </p>
                    )}
                    <code className="bg-muted mt-2 block rounded-md px-3 py-2 text-sm break-all select-all">
                      {href.origin}/admin/invite?token={href.inviteToken}
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
                    <input type="hidden" name="redirectTo" value={href.pathname + href.search} />

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
                              {submissionRows.map(([key, value]) => (
                                <tr key={key} className="border-b last:border-b-0">
                                  <td className="text-muted-foreground w-1/3 py-2 pr-4 align-top font-medium">{key}</td>
                                  <td className="py-2 align-top break-words whitespace-pre-wrap">{value}</td>
                                </tr>
                              ))}
                              {submissionRows.length === 0 && (
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
                          const visibleFields = set.fields.filter(isVisible);
                          const renderField = (fieldName: string) => (
                            <FieldControl
                              key={fieldName}
                              name={fieldName}
                              field={fieldView[fieldName].field}
                              value={fieldView[fieldName].value}
                              readOnly={fieldView[fieldName].readOnly}
                              labelActions={labelActions(fieldView[fieldName])}
                              colorPalette={colorPalette}
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
                                {set.fields.filter(isVisible).map((fieldName) => (
                                  <div key={fieldName}>
                                    <FieldControl
                                      name={fieldName}
                                      field={fieldView[fieldName].field}
                                      value={fieldView[fieldName].value}
                                      readOnly={fieldView[fieldName].readOnly}
                                      labelActions={labelActions(fieldView[fieldName])}
                                      colorPalette={colorPalette}
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
                                            <dd className="text-foreground/70">{dates.publishAt}</dd>
                                          </div>
                                          {Boolean(doc._unpublishAt) && (
                                            <div className="flex gap-2 lg:justify-between">
                                              <dt>Unpublishes</dt>
                                              <dd className="text-foreground/70">{dates.unpublishAt}</dd>
                                            </div>
                                          )}
                                        </>
                                      )}
                                      <div className="flex gap-2 lg:justify-between">
                                        <dt>Created</dt>
                                        <dd className="text-foreground/70">{dates.created}</dd>
                                      </div>
                                      <div className="flex gap-2 lg:justify-between">
                                        <dt>{translationMode ? `${selectedLanguage} updated` : "Updated"}</dt>
                                        <dd className="text-foreground/70">
                                          {translationMode ? dates.translationUpdated : dates.updated}
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
      {requestedLocale && hasLocales && <WorkingLocale locale={requestedLocale} />}
    </>
  );
}
