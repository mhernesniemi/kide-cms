import DocumentsDataTable from "../components/DocumentsDataTable";
import { Island } from "../render/island";
import { formatPagePath } from "../../core/admin";
import type { loadSinglesView } from "./SinglesView.load";

export type SinglesViewData = Awaited<ReturnType<typeof loadSinglesView>>;

export function SinglesView({ singletonsData, showLocalesColumn, locales, dateSettings, anyDrafts }: SinglesViewData) {
  return (
    <section className="space-y-6 px-4 py-6 lg:py-8 lg:pr-8 lg:pl-12">
      <div className="flex items-start justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Singles</h1>
      </div>
      <Island
        name="DocumentsDataTable"
        component={DocumentsDataTable}
        props={{
          collectionSlug: "singles",
          draftsEnabled: true,
          duplicateEnabled: false,
          dateSettings,
          supportedLocales: showLocalesColumn ? locales : undefined,
          title: "Singles",
          columns: [
            { key: "name", label: "Name" },
            { key: "__page", label: "URL" },
            ...(anyDrafts ? [{ key: "_status", label: "Status" }] : []),
            { key: "updatedAt", label: "Updated At" },
          ],
          data: singletonsData.map((s) => ({
            id: s.id,
            collectionSlug: s.collectionSlug,
            editHref: s.editHref,
            locales: s.locales,
            localeStates: s.localeStates,
            searchText: `${s.label} ${s.collectionSlug}`,
            values: { name: s.label, __page: formatPagePath(s.page), _status: s.status, updatedAt: s.updatedAt },
            pageHref: s.pageHref ?? undefined,
          })),
          searchPlaceholder: "Filter singles...",
          showLocalesColumn,
        }}
      />
    </section>
  );
}
