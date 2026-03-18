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

type DocumentsDataTableProps = {
  collectionSlug: string;
  draftsEnabled?: boolean;
  newHref?: string;
  title: string;
  searchPlaceholder?: string;
  columns: DataTableColumn[];
  data: DataTableRow[];
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
  newHref,
  title,
  searchPlaceholder = "Filter documents...",
  columns,
  data,
}: DocumentsDataTableProps) {
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = React.useState<Record<string, boolean>>({
    search: false,
  });
  const [rowSelection, setRowSelection] = React.useState({});
  const [isPending, startTransition] = React.useTransition();
  const [deleteConfirm, setDeleteConfirm] = React.useState<DataTableRow[] | null>(null);

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
        const url = new URL(window.location.href);
        url.searchParams.set("_toast", "error");
        url.searchParams.set("_msg", msg);
        window.location.assign(url.pathname + url.search);
      }
    },
    [collectionSlug],
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
      {
        id: "search",
        accessorFn: (row) =>
          [row.searchText, ...Object.values(row.values), row.locales.join(" ")].join(" ").toLowerCase(),
        header: () => null,
        cell: () => null,
        enableSorting: false,
        enableHiding: false,
      },
      ...columns.map<ColumnDef<DataTableRow>>((column) => ({
        accessorFn: (row) => row.values[column.key] ?? "",
        id: column.key,
        header: ({ column: headerColumn }) => <DataTableColumnHeader column={headerColumn} title={column.label} />,
        cell: ({ row }) => {
          const value = row.original.values[column.key] ?? "—";
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
              <Badge key={locale} variant="outline" className="uppercase">
                {locale}
              </Badge>
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
    [columns, draftsEnabled, isPending, primaryColumnKey],
  );

  const table = useReactTable({
    data,
    columns: tableColumns,
    getRowId: (row) => row.id,
    enableRowSelection: true,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
    },
  });

  const searchColumn = table.getColumn("search");
  const selectedRows = table.getSelectedRowModel().rows.map((row) => row.original);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="relative w-full sm:w-80">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              placeholder={searchPlaceholder}
              value={(searchColumn?.getFilterValue() as string) ?? ""}
              onChange={(event) => searchColumn?.setFilterValue(event.target.value)}
              className="pl-9 text-sm"
            />
          </div>
          <div className="text-muted-foreground hidden text-sm md:block">
            {table.getFilteredRowModel().rows.length} {title.toLowerCase()}
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

      <div className="rounded-lg border">
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

      {table.getPageCount() > 1 && (
        <div className="flex items-center justify-end px-1">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              <ChevronLeft className="size-4" />
              Previous
            </Button>
            <div className="text-muted-foreground text-sm">
              Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
            </div>
            <Button variant="outline" size="sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
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
