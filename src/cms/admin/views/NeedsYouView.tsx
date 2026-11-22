import DocumentsDataTable from "../components/DocumentsDataTable";
import { Island } from "../render/island";
import type { loadNeedsYouView } from "./NeedsYouView.load";

export type NeedsYouViewData = Awaited<ReturnType<typeof loadNeedsYouView>>;

export function NeedsYouView({ rows, approver }: NeedsYouViewData) {
  return (
    <section className="space-y-6 px-4 py-6 lg:py-8 lg:pr-8 lg:pl-12">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Needs you</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {approver
              ? "Documents assigned to you, and anything submitted for review."
              : "Documents assigned to you that still need work."}
          </p>
        </div>
      </div>
      {rows.length === 0 ? (
        <div className="text-muted-foreground rounded-lg border border-dashed px-6 py-12 text-center text-sm">
          Nothing needs you right now.
        </div>
      ) : (
        <Island
          name="DocumentsDataTable"
          component={DocumentsDataTable}
          props={{
            collectionSlug: "needs-you",
            draftsEnabled: true,
            duplicateEnabled: false,
            showLocalesColumn: false,
            title: "Needs you",
            columns: [
              { key: "title", label: "Title" },
              { key: "collection", label: "Collection" },
              { key: "_reason", label: "Why" },
              { key: "_review", label: "Review" },
              { key: "_updatedAt", label: "Updated" },
            ],
            data: rows,
            searchPlaceholder: "Filter…",
          }}
        />
      )}
    </section>
  );
}
