import DocumentsDataTable from "../components/DocumentsDataTable";
import { Island } from "../render/island";
import type { loadRecentView } from "./RecentView.load";

export type RecentViewData = Awaited<ReturnType<typeof loadRecentView>>;

export function RecentView({ recentRows, showLocalesColumn, locales }: RecentViewData) {
  return (
    <section className="space-y-6 px-4 py-6 lg:py-8 lg:pr-8 lg:pl-12">
      <div className="flex items-start justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Recent</h1>
      </div>
      <Island
        name="DocumentsDataTable"
        component={DocumentsDataTable}
        props={{
          collectionSlug: "recent",
          draftsEnabled: true,
          title: "Recent",
          columns: [
            { key: "title", label: "Title" },
            { key: "collection", label: "Collection" },
            { key: "_status", label: "Status" },
            { key: "_updatedAt", label: "Updated" },
          ],
          data: recentRows,
          searchPlaceholder: "Filter recent entries...",
          showLocalesColumn,
          supportedLocales: showLocalesColumn ? locales : undefined,
        }}
      />
    </section>
  );
}
