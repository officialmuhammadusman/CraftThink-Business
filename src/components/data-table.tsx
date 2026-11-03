"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Columns3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

export type DataTableColumn<T> = {
  key: string;
  label: string;
  sortable?: boolean;
  /** "right" for numeric columns (right-aligned numbers). */
  align?: "left" | "right";
  /** Value used for sorting/filtering. Defaults to "" when absent. */
  accessor?: (row: T) => string | number;
  render: (row: T) => React.ReactNode;
  className?: string;
};

/**
 * Professional client-side table: text filter, column sorting, column
 * visibility, row selection (count toolbar; no bulk mutation — no bulk API
 * exists, so selection never deletes or edits anything), sticky header,
 * dense 40px rows, right-aligned numbers, fixed 10-rows-per-page
 * pagination. Works over the rows already fetched for the current
 * page/filter from the API.
 */
export function DataTable<T extends { id: string }>({
  rows,
  columns,
  searchPlaceholder = "Search…",
  emptyMessage = "No records found.",
  selectable = false,
  paginate = true,
}: {
  rows: T[];
  columns: DataTableColumn<T>[];
  searchPlaceholder?: string;
  emptyMessage?: string;
  selectable?: boolean;
  /**
   * Set false when the rows are already one server-fetched page and the
   * page drives its own single pager below the table — avoids two
   * competing pagers on the same table.
   */
  paginate?: boolean;
}) {
  const [query, setQuery] = React.useState("");
  const [sortKey, setSortKey] = React.useState<string | null>(null);
  const [sortDir, setSortDir] = React.useState<"asc" | "desc">("asc");
  const [page, setPage] = React.useState(1);
  const [hidden, setHidden] = React.useState<Set<string>>(new Set());
  const [selected, setSelected] = React.useState<Set<string>>(new Set());

  // Fixed page size for every table in the app (no per-table exceptions).
  const pageSize = 10;

  const visibleColumns = columns.filter((c) => !hidden.has(c.key));

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    let out = rows;
    if (q) {
      out = rows.filter((row) =>
        columns.some((c) => {
          const v = c.accessor ? c.accessor(row) : "";
          return String(v).toLowerCase().includes(q);
        }),
      );
    }
    if (sortKey) {
      const col = columns.find((c) => c.key === sortKey);
      if (col?.accessor) {
        out = [...out].sort((a, b) => {
          const va = col.accessor!(a);
          const vb = col.accessor!(b);
          const cmp =
            typeof va === "number" && typeof vb === "number"
              ? va - vb
              : String(va).localeCompare(String(vb));
          return sortDir === "asc" ? cmp : -cmp;
        });
      }
    }
    return out;
  }, [rows, query, sortKey, sortDir, columns]);

  const pageCount = paginate ? Math.max(1, Math.ceil(filtered.length / pageSize)) : 1;
  const safePage = paginate ? Math.min(page, pageCount) : 1;
  const pageRows = paginate
    ? filtered.slice((safePage - 1) * pageSize, safePage * pageSize)
    : filtered;
  const allPageSelected =
    pageRows.length > 0 && pageRows.every((r) => selected.has(r.id));

  function toggleSort(key: string) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
    setPage(1);
  }

  function toggleSelectAll(checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const r of pageRows) {
        if (checked) next.add(r.id);
        else next.delete(r.id);
      }
      return next;
    });
  }

  const colSpan = visibleColumns.length + (selectable ? 1 : 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(1);
          }}
          placeholder={searchPlaceholder}
          className="sm:max-w-sm"
        />
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" size="sm">
                <Columns3 className="size-5" /> Columns
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {columns.map((c) => (
                <DropdownMenuCheckboxItem
                  key={c.key}
                  checked={!hidden.has(c.key)}
                  onCheckedChange={(checked) => {
                    setHidden((prev) => {
                      const next = new Set(prev);
                      if (checked) next.delete(c.key);
                      else next.add(c.key);
                      return next;
                    });
                  }}
                >
                  {c.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      {selected.size > 0 ? (
        <div className="flex min-h-12 items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3">
          <p className="text-base text-slate-700">
            {selected.size} row{selected.size === 1 ? "" : "s"} selected
          </p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setSelected(new Set())}
          >
            Clear selection
          </Button>
        </div>
      ) : null}
      <div className="max-h-[70vh] overflow-auto rounded-md border border-slate-200 bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              {selectable ? (
                <TableHead className="sticky top-0 z-10 w-12 bg-white">
                  <Checkbox
                    checked={allPageSelected}
                    onCheckedChange={(v) => toggleSelectAll(v === true)}
                    aria-label="Select all rows on this page"
                  />
                </TableHead>
              ) : null}
              {visibleColumns.map((c) => (
                <TableHead
                  key={c.key}
                  className={cn(
                    "sticky top-0 z-10 bg-white",
                    c.align === "right" && "text-right",
                    c.className,
                  )}
                >
                  {c.sortable ? (
                    <button
                      type="button"
                      onClick={() => toggleSort(c.key)}
                      className={cn(
                        "inline-flex min-h-11 items-center gap-1 font-medium text-slate-900",
                        c.align === "right" && "float-right",
                      )}
                    >
                      {c.label}
                      {sortKey === c.key ? (
                        sortDir === "asc" ? (
                          <ArrowUp className="size-5" />
                        ) : (
                          <ArrowDown className="size-5" />
                        )
                      ) : (
                        <ArrowUpDown className="size-5 opacity-40" />
                      )}
                    </button>
                  ) : (
                    c.label
                  )}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={colSpan} className="py-8 text-center text-slate-500">
                  {emptyMessage}
                </TableCell>
              </TableRow>
            ) : (
              pageRows.map((row) => (
                <TableRow key={row.id} data-state={selected.has(row.id) ? "selected" : undefined}>
                  {selectable ? (
                    <TableCell className="py-2">
                      <Checkbox
                        checked={selected.has(row.id)}
                        onCheckedChange={(v) => {
                          setSelected((prev) => {
                            const next = new Set(prev);
                            if (v === true) next.add(row.id);
                            else next.delete(row.id);
                            return next;
                          });
                        }}
                        aria-label="Select row"
                      />
                    </TableCell>
                  ) : null}
                  {visibleColumns.map((c) => (
                    <TableCell
                      key={c.key}
                      className={cn(
                        "py-2 tabular-nums",
                        c.align === "right" && "text-right",
                        c.className,
                      )}
                    >
                      {c.render(row)}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      {paginate ? (
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-500">
          Showing {pageRows.length} of {filtered.length} records
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-11"
            disabled={safePage <= 1}
            onClick={() => setPage(safePage - 1)}
          >
            <ChevronLeft className="size-5" /> Previous
          </Button>
          {(() => {
            const start = Math.max(1, Math.min(safePage - 2, pageCount - 4));
            const end = Math.min(pageCount, start + 4);
            const nums: number[] = [];
            for (let p = start; p <= end; p++) nums.push(p);
            return nums.map((p) => (
              <Button
                key={p}
                type="button"
                variant={p === safePage ? "default" : "outline"}
                size="sm"
                className="min-h-11 min-w-11 px-2"
                aria-current={p === safePage ? "page" : undefined}
                onClick={() => setPage(p)}
              >
                {p}
              </Button>
            ));
          })()}
          <span className="text-sm text-slate-600">
            Page {safePage} of {pageCount}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-11"
            disabled={safePage >= pageCount}
            onClick={() => setPage(safePage + 1)}
          >
            Next <ChevronRight className="size-5" />
          </Button>
        </div>
      </div>
      ) : null}
    </div>
  );
}
