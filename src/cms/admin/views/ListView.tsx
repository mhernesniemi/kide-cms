import { Plus } from "lucide-react";

import DocumentsDataTable from "../components/DocumentsDataTable";
import { buttonVariants } from "../components/ui/button";
import { Island } from "../render/island";
import type { loadListView } from "./ListView.load";

export type ListViewData = Awaited<ReturnType<typeof loadListView>>;

export function ListView({
  collection,
  showLocalesColumn,
  defaultLocale,
  locales,
  columns,
  canCreate,
  duplicateEnabled,
  deleteEnabled,
  labelField,
  dateSettings,
  tableRows,
  activeLang,
  langOptions,
  totalDocs,
  totalPages,
  currentPage,
  currentSort,
  searchParam,
  localeQuery,
}: ListViewData) {
  return (
    <section className="space-y-6 px-4 py-6 lg:py-8 lg:pr-8 lg:pl-12">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{collection.labels.plural}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canCreate && (
            <a href={`/admin/${collection.slug}/new`} className={buttonVariants({})}>
              <Plus className="size-4" />
              {collection.slug === "users" ? "Invite user" : `New ${collection.labels.singular}`}
            </a>
          )}
        </div>
      </div>
      <Island
        name="DocumentsDataTable"
        component={DocumentsDataTable}
        props={{
          collectionSlug: collection.slug,
          draftsEnabled: collection.drafts,
          duplicateEnabled,
          deleteEnabled,
          showLocalesColumn,
          defaultLocale: locales.length > 1 ? defaultLocale : undefined,
          labelField,
          newHref: `/admin/${collection.slug}/new`,
          title: collection.labels.plural,
          columns,
          data: tableRows,
          dateSettings,
          supportedLocales: showLocalesColumn ? locales : undefined,
          localeQuery: showLocalesColumn ? localeQuery : undefined,
          searchPlaceholder: `Filter ${collection.labels.plural.toLowerCase()}...`,
          languageFilter: showLocalesColumn ? { active: activeLang, options: langOptions } : undefined,
          serverPagination: {
            totalDocs,
            totalPages,
            currentPage,
            currentSort,
            currentSearch: searchParam,
          },
        }}
      />
    </section>
  );
}
