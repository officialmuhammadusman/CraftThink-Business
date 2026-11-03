"use client";

import * as React from "react";

/** Fixed page size for every table and card list in the app. */
export const PAGE_SIZE = 10;

/**
 * Client-side pagination over an already-filtered/sorted list.
 * Filters/sorting must be applied BEFORE passing items in, so the pager
 * always paginates the filtered result. The returned page is clamped to
 * the available range, so the UI never shows an empty page: callers should
 * also reset to page 1 when a filter/search changes (the pager clamps as
 * a safety net when they don't).
 */
export function usePagination<T>(items: T[]) {
  const [page, setPage] = React.useState(1);
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageItems = React.useMemo(
    () => items.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [items, safePage],
  );
  return { page: safePage, totalPages, pageItems, setPage };
}
