"use client";

import * as React from "react";
import {
  type Column,
  type ColumnDef,
  type ColumnFiltersState,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Loader2,
  MoreHorizontal,
  Search,
} from "lucide-react";

import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/admin/ui/alert-dialog";
import { Badge, StatusBadge } from "@/components/admin/ui/badge";
import { Button } from "@/components/admin/ui/button";
import { Checkbox } from "@/components/admin/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/admin/ui/dropdown-menu";
import { Input } from "@/components/admin/ui/input";
import { cn } from "@/lib/utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/admin/ui/table";

type DataTableColumn = {
  key: string;
  label: string;
};

type DataTableRow = {
  id: string;
  editHref: string;
  status?: string;
  locales: string[];
  searchText: string;
  values: Record<string, string>;
};

type ServerPaginationConfig = {
  totalDocs: number;
  totalPages: number;
  currentPage: number;
  pageSize: number;
  currentSort: { field: string; direction: "asc" | "desc" };
  currentSearch: string;
};

type DocumentsDataTableProps = {
  collectionSlug: string;
  draftsEnabled?: boolean;
  defaultLocale?: string;
  labelField?: string;
  newHref?: string;
  title: string;
  searchPlaceholder?: string;
  columns: DataTableColumn[];
  data: DataTableRow[];
  serverPagination?: ServerPaginationConfig;
};

const formatDateClient = (value: unknown): string => {
  if (!value) return "\u2014";
  const date = new Date(String(value));
  if (isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const getVisualStatus = (d: Record<string, unknown>): string => {
  const status = String(d._status ?? "draft");
  if (status === "scheduled") return "scheduled";
  if (status === "published" && d._publishedAt && d._updatedAt) {
    return String(d._updatedAt) > String(d._publishedAt) ? "changed" : "published";
  }
  return status;
};

function DataTableColumnHeader({ column, title }: { column: Column<DataTableRow, unknown>; title: string }) {
  if (!column.getCanSort()) {
    return <span>{title}</span>;
  }

  const sorted = column.getIsSorted();
  const SortIcon = sorted === "asc" ? ArrowUp : sorted === "desc" ? ArrowDown : ArrowUpDown;

  return (
    <Button
      variant="ghost"
      size="sm"
      className="-ml-2 h-8 px-2 text-sm font-medium"
      onClick={() => column.toggleSorting(sorted === "asc")}
    >
      <span>{title}</span>
      <SortIcon className="text-muted-foreground size-4" />
    </Button>
  );
}

export default function DocumentsDataTable({
  collectionSlug,
  draftsEnabled = false,
  defaultLocale,
  labelField = "title",
  newHref,
  title,
  searchPlaceholder = "Filter documents...",
  columns,
  data,
  serverPagination,
}: DocumentsDataTableProps) {
  const isServerMode = !!serverPagination;

  const [actionError, setActionError] = React.useState<string | null>(null);
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = React.useState<Record<string, boolean>>({
    search: false,
  });
  const [rowSelection, setRowSelection] = React.useState({});
  const [isPending, startTransition] = React.useTransition();
  const [deleteConfirm, setDeleteConfirm] = React.useState<DataTableRow[] | null>(null);
  const [deleteRefWarning, setDeleteRefWarning] = React.useState<string | null>(null);

  // Check for references when delete is triggered
  React.useEffect(() => {
    if (!deleteConfirm || deleteConfirm.length === 0) {
      setDeleteRefWarning(null);
      return;
    }
    (async () => {
      let totalRefs = 0;
      const parts: string[] = [];
      for (const row of deleteConfirm) {
        try {
          const res = await fetch(`/api/cms/references/${collectionSlug}/${row.id}`);
          if (res.ok) {
            const { refs, total } = await res.json();
            totalRefs += total;
            for (const r of refs) {
              const existing = parts.find((p) => p.includes(r.collection.toLowerCase()));
              if (!existing) parts.push(`${r.count} ${r.collection.toLowerCase()}`);
            }
          }
        } catch {}
      }
      if (totalRefs > 0) {
        setDeleteRefWarning(`Referenced by ${parts.join(", ")}. Deleting will leave broken references.`);
      } else {
        setDeleteRefWarning(null);
      }
    })();
  }, [deleteConfirm, collectionSlug]);

  // Server-side pagination state
  const [serverData, setServerData] = React.useState<DataTableRow[]>(data);
  const [serverTotalDocs, setServerTotalDocs] = React.useState(serverPagination?.totalDocs ?? 0);
  const [serverTotalPages, setServerTotalPages] = React.useState(serverPagination?.totalPages ?? 1);
  const [serverPage, setServerPage] = React.useState(serverPagination?.currentPage ?? 1);
  const [serverSort, setServerSort] = React.useState(serverPagination?.currentSort ?? null);
  const [serverSearch, setServerSearch] = React.useState(serverPagination?.currentSearch ?? "");
  const [searchInput, setSearchInput] = React.useState(serverPagination?.currentSearch ?? "");
  const [isLoading, setIsLoading] = React.useState(false);
  const searchTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const pageSize = serverPagination?.pageSize ?? 20;

  const fetchPage = React.useCallback(
    async (page: number, sort: { field: string; direction: string } | null, search: string) => {
      if (!isServerMode) return;
      setIsLoading(true);
      setRowSelection({});
      try {
        const params = new URLSearchParams();
        params.set("status", "any");
        params.set("limit", String(pageSize));
        params.set("offset", String((page - 1) * pageSize));
        if (sort) {
          params.set("sort", JSON.stringify(sort));
        }
        if (search) {
          params.set("search", search);
        }

        const response = await fetch(`/api/cms/${collectionSlug}?${params}`);
        if (!response.ok) throw new Error("Failed to fetch");
        const result = await response.json();

        setServerData(
          result.docs.map((entry: Record<string, unknown>) => ({
            id: String(entry._id),
            editHref: `/admin/${collectionSlug}/${entry._id}`,
            status: getVisualStatus(entry),
            locales: [
              ...(defaultLocale ? [defaultLocale] : []),
              ...(Array.isArray(entry._availableLocales)
                ? (entry._availableLocales as string[]).filter((l) => l !== defaultLocale)
                : []),
            ],
            searchText: String(entry[labelField] ?? entry.slug ?? entry._id ?? ""),
            values: Object.fromEntries(
              columns.map((column) => [
                column.key,
                column.key === "_status"
                  ? getVisualStatus(entry)
                  : column.key === "_updatedAt" || column.key === "_createdAt"
                    ? formatDateClient(entry[column.key])
                    : String(entry[column.key] ?? "\u2014"),
              ]),
            ),
          })),
        );
        setServerTotalDocs(result.totalDocs);
        setServerTotalPages(result.totalPages);
        setServerPage(page);

        // Update URL for bookmarkability
        const url = new URL(window.location.href);
        url.searchParams.set("page", String(page));
        if (sort) {
          url.searchParams.set("sort", sort.field);
          url.searchParams.set("dir", sort.direction);
        }
        if (search) {
          url.searchParams.set("q", search);
        } else {
          url.searchParams.delete("q");
        }
        url.searchParams.delete("_toast");
        url.searchParams.delete("_msg");
        window.history.replaceState({}, "", url.pathname + url.search);
      } catch (error) {
        console.error("Failed to fetch page:", error);
      } finally {
        setIsLoading(false);
      }
    },
    [isServerMode, collectionSlug, columns, pageSize, defaultLocale, labelField],
  );

  // Cleanup debounce timer
  React.useEffect(() => {
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, []);

  // "C" hotkey to create new document
  React.useEffect(() => {
    if (!newHref) return;
    const handleKeydown = (e: KeyboardEvent) => {
      if (e.key === "c" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const tag = (e.target as HTMLElement).tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        if ((e.target as HTMLElement).isContentEditable) return;
        window.location.assign(newHref);
      }
    };
    document.addEventListener("keydown", handleKeydown);
    return () => document.removeEventListener("keydown", handleKeydown);
  }, [newHref]);

  const primaryColumnKey = columns.find((column) => !column.key.startsWith("_"))?.key ?? columns[0]?.key;

  const handleSearchChange = React.useCallback(
    (value: string) => {
      setSearchInput(value);
      if (!isServerMode) return;
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
      searchTimerRef.current = setTimeout(() => {
        setServerSearch(value);
        void fetchPage(1, serverSort, value);
      }, 300);
    },
    [isServerMode, serverSort, fetchPage],
  );

  const handleSortingChange = React.useCallback(
    (updater: React.SetStateAction<SortingState>) => {
      const newSorting = typeof updater === "function" ? updater(sorting) : updater;
      setSorting(newSorting);

      if (isServerMode && newSorting.length > 0) {
        const sort = {
          field: newSorting[0].id,
          direction: (newSorting[0].desc ? "desc" : "asc") as "asc" | "desc",
        };
        setServerSort(sort);
        void fetchPage(1, sort, serverSearch);
      }
    },
    [isServerMode, sorting, serverSearch, fetchPage],
  );

  const runAction = React.useCallback(
    async (action: "publish" | "unpublish" | "delete", rows: DataTableRow[]) => {
      if (!rows.length) {
        return;
      }

      setActionError(null);

      try {
        await Promise.all(
          rows.map(async (row) => {
            // Extract collection slug from editHref (/admin/{slug}/{id})
            const rowCollection = row.editHref.split("/")[2] ?? collectionSlug;
            const endpoint =
              action === "delete"
                ? `/api/cms/${rowCollection}/${row.id}`
                : `/api/cms/${rowCollection}/${row.id}/${action}`;

            const response = await fetch(endpoint, {
              method: action === "delete" ? "DELETE" : "POST",
              headers: {
                Accept: "application/json",
              },
            });

            if (!response.ok) {
              throw new Error(`Failed to ${action} document.`);
            }
          }),
        );

        if (isServerMode) {
          // Re-fetch current page after action
          const targetPage = action === "delete" ? 1 : serverPage;
          await fetchPage(targetPage, serverSort, serverSearch);
          return;
        }

        // Reload with toast params so the server-side Toast component renders
        const count = rows.length;
        const label = count === 1 ? "document" : "documents";
        const pastTense = action === "publish" ? "published" : action === "unpublish" ? "unpublished" : "deleted";
        const msg = `${count} ${label} ${pastTense}`;
        const url = new URL(window.location.href);
        url.searchParams.set("_toast", "success");
        url.searchParams.set("_msg", msg);
        window.location.assign(url.pathname + url.search);
      } catch (error) {
        const msg = error instanceof Error ? error.message : "Action failed";
        if (isServerMode) {
          setActionError(msg);
          return;
        }
        const url = new URL(window.location.href);
        url.searchParams.set("_toast", "error");
        url.searchParams.set("_msg", msg);
        window.location.assign(url.pathname + url.search);
      }
    },
    [collectionSlug, isServerMode, serverPage, serverSort, serverSearch, fetchPage],
  );

  const tableColumns = React.useMemo<ColumnDef<DataTableRow>[]>(
    () => [
      {
        id: "select",
        header: ({ table }) => (
          <Checkbox
            checked={table.getIsAllPageRowsSelected()}
            indeterminate={table.getIsSomePageRowsSelected()}
            onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
            aria-label="Select all"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
            aria-label="Select row"
          />
        ),
        enableSorting: false,
        enableHiding: false,
      },
      ...(!isServerMode
        ? [
            {
              id: "search",
              accessorFn: (row: DataTableRow) =>
                [row.searchText, ...Object.values(row.values), row.locales.join(" ")].join(" ").toLowerCase(),
              header: () => null,
              cell: () => null,
              enableSorting: false,
              enableHiding: false,
            } as ColumnDef<DataTableRow>,
          ]
        : []),
      ...columns.map<ColumnDef<DataTableRow>>((column) => ({
        accessorFn: (row) => row.values[column.key] ?? "",
        id: column.key,
        header: ({ column: headerColumn }) => <DataTableColumnHeader column={headerColumn} title={column.label} />,
        cell: ({ row }) => {
          const value = row.original.values[column.key] ?? "\u2014";
          if (column.key === "_status") {
            return (
              <StatusBadge
                status={row.original.status ?? value}
                className="text-muted-foreground text-sm font-normal"
              />
            );
          }
          const isPrimary = column.key === primaryColumnKey;
          return (
            <>
              {isPrimary ? (
                <a
                  href={row.original.editHref}
                  className="text-foreground font-medium underline-offset-2 hover:underline"
                >
                  {value}
                </a>
              ) : (
                <div className="text-muted-foreground">{value}</div>
              )}
            </>
          );
        },
      })),
      {
        accessorFn: (row) => row.locales.join(", "),
        id: "locales",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Locales" />,
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1.5">
            {row.original.locales.map((locale) => (
              <a key={locale} href={`${row.original.editHref}?locale=${locale}`} onClick={(e) => e.stopPropagation()}>
                <Badge
                  variant="outline"
                  className="text-muted-foreground hover:border-foreground/50 hover:text-foreground uppercase transition-colors"
                >
                  {locale}
                </Badge>
              </a>
            ))}
          </div>
        ),
      },
      {
        id: "actions",
        enableSorting: false,
        enableHiding: false,
        cell: ({ row }) => (
          <div className="flex justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" className="rounded-md" aria-label="Open actions menu">
                  <MoreHorizontal />
                  <span className="sr-only">Open menu</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => window.location.assign(row.original.editHref)}>
                  Edit document
                </DropdownMenuItem>
                {draftsEnabled && (
                  <>
                    <DropdownMenuItem
                      disabled={isPending || row.original.status === "published"}
                      onClick={() =>
                        startTransition(() => {
                          void runAction("publish", [row.original]);
                        })
                      }
                    >
                      Publish
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={isPending || row.original.status === "draft"}
                      onClick={() =>
                        startTransition(() => {
                          void runAction("unpublish", [row.original]);
                        })
                      }
                    >
                      Unpublish
                    </DropdownMenuItem>
                  </>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  disabled={isPending}
                  onClick={() => setDeleteConfirm([row.original])}
                >
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ),
      },
    ],
    [columns, draftsEnabled, isPending, primaryColumnKey, isServerMode, runAction],
  );

  const table = useReactTable({
    data: isServerMode ? serverData : data,
    columns: tableColumns,
    getRowId: (row) => row.id,
    enableRowSelection: true,
    onSortingChange: isServerMode ? handleSortingChange : setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    ...(isServerMode
      ? {
          manualPagination: true,
          manualSorting: true,
          manualFiltering: true,
          pageCount: serverTotalPages,
        }
      : {
          getPaginationRowModel: getPaginationRowModel(),
          getSortedRowModel: getSortedRowModel(),
          getFilteredRowModel: getFilteredRowModel(),
        }),
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
      ...(isServerMode ? { pagination: { pageIndex: serverPage - 1, pageSize } } : {}),
    },
  });

  const searchColumn = !isServerMode ? table.getColumn("search") : null;
  const selectedRows = table.getSelectedRowModel().rows.map((row) => row.original);
  const displayedTotal = isServerMode ? serverTotalDocs : table.getFilteredRowModel().rows.length;
  const displayedPageCount = isServerMode ? serverTotalPages : table.getPageCount();
  const displayedPageIndex = isServerMode ? serverPage : table.getState().pagination.pageIndex + 1;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="relative w-full sm:w-80">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              placeholder={searchPlaceholder}
              value={isServerMode ? searchInput : ((searchColumn?.getFilterValue() as string) ?? "")}
              onChange={(event) => {
                const value = event.target.value;
                if (isServerMode) {
                  handleSearchChange(value);
                } else {
                  searchColumn?.setFilterValue(value);
                }
              }}
              className="pl-9 text-sm"
            />
          </div>
          <div className="text-muted-foreground hidden text-sm md:block">
            {isLoading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <>
                {displayedTotal} {title.toLowerCase()}
              </>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {selectedRows.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" disabled={isPending}>
                  {isPending ? "Working..." : `${selectedRows.length} selected`}
                  <ChevronDown className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel>Selected actions</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {selectedRows.length === 1 && (
                  <DropdownMenuItem onClick={() => window.location.assign(selectedRows[0].editHref)}>
                    Edit document
                  </DropdownMenuItem>
                )}
                {draftsEnabled && (
                  <>
                    <DropdownMenuItem
                      disabled={isPending}
                      onClick={() =>
                        startTransition(() => {
                          void runAction("publish", selectedRows);
                        })
                      }
                    >
                      Publish selected
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={isPending}
                      onClick={() =>
                        startTransition(() => {
                          void runAction("unpublish", selectedRows);
                        })
                      }
                    >
                      Unpublish selected
                    </DropdownMenuItem>
                  </>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  disabled={isPending}
                  onClick={() => setDeleteConfirm(selectedRows)}
                >
                  Delete selected
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {actionError && (
        <div className="border-destructive/30 bg-destructive/5 text-destructive rounded-md border px-4 py-3 text-sm">
          {actionError}
        </div>
      )}

      <div className={cn("rounded-lg border", isLoading && "opacity-60")}>
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers
                  .filter((header) => header.column.id !== "search")
                  .map((header) => (
                    <TableHead key={header.id} className={header.column.id === "select" ? "w-10" : undefined}>
                      {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} data-state={row.getIsSelected() && "selected"}>
                  {row
                    .getVisibleCells()
                    .filter((cell) => cell.column.id !== "search")
                    .map((cell) => (
                      <TableCell key={cell.id} className={cell.column.id === "select" ? "w-10" : undefined}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={tableColumns.length - 1} className="text-muted-foreground h-24 text-center">
                  No documents found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {displayedPageCount > 1 && (
        <div className="flex items-center justify-end px-1">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (isServerMode) {
                  void fetchPage(serverPage - 1, serverSort, serverSearch);
                } else {
                  table.previousPage();
                }
              }}
              disabled={isServerMode ? serverPage <= 1 || isLoading : !table.getCanPreviousPage()}
            >
              <ChevronLeft className="size-4" />
              Previous
            </Button>
            <div className="text-muted-foreground text-sm">
              Page {displayedPageIndex} of {displayedPageCount}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (isServerMode) {
                  void fetchPage(serverPage + 1, serverSort, serverSearch);
                } else {
                  table.nextPage();
                }
              }}
              disabled={isServerMode ? serverPage >= serverTotalPages || isLoading : !table.getCanNextPage()}
            >
              Next
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}
      <AlertDialog open={deleteConfirm !== null} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleteConfirm && deleteConfirm.length === 1 ? "Delete document" : "Delete documents"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteRefWarning && (
                <span className="mb-2 block font-medium text-amber-600 dark:text-amber-400">{deleteRefWarning}</span>
              )}
              {deleteConfirm && deleteConfirm.length === 1
                ? "This action cannot be undone. This will permanently delete this document."
                : `This action cannot be undone. This will permanently delete ${deleteConfirm?.length ?? 0} documents.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose>
              <Button variant="outline">Cancel</Button>
            </AlertDialogClose>
            <Button
              variant="destructive"
              onClick={() => {
                if (deleteConfirm) {
                  startTransition(() => {
                    void runAction("delete", deleteConfirm);
                  });
                }
                setDeleteConfirm(null);
              }}
            >
              Delete
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
