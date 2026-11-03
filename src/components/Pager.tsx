import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Window of page numbers around the current page (max 5 buttons). */
function pageWindow(page: number, totalPages: number): number[] {
  const start = Math.max(1, Math.min(page - 2, totalPages - 4));
  const end = Math.min(totalPages, start + 4);
  const out: number[] = [];
  for (let p = start; p <= end; p++) out.push(p);
  return out;
}

/**
 * Single pager used below every paginated table and card list: Previous /
 * numbered pages / Next plus a "Page X of Y" indicator. Buttons are at
 * least 44px tall on phones and the pager sits below the content, never
 * floating over it. Callers drive it from server totals (server-paged
 * lists) or from usePagination (client-paged lists); either way there is
 * exactly one pager per table.
 */
export default function Pager({
  page,
  totalPages,
  onPage,
}: {
  page: number;
  totalPages: number;
  onPage: (page: number) => void;
}) {
  const safeTotal = Math.max(1, totalPages);
  const safePage = Math.min(Math.max(1, page), safeTotal);
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2 pb-[env(safe-area-inset-bottom)]">
      <Button
        type="button"
        variant="outline"
        className="min-h-11"
        disabled={safePage <= 1}
        onClick={() => onPage(safePage - 1)}
      >
        Previous
      </Button>
      {pageWindow(safePage, safeTotal).map((p) => (
        <Button
          key={p}
          type="button"
          variant={p === safePage ? "default" : "outline"}
          className={cn("min-h-11 min-w-11 px-2")}
          aria-current={p === safePage ? "page" : undefined}
          onClick={() => onPage(p)}
        >
          {p}
        </Button>
      ))}
      <span className="text-base text-slate-500">
        Page {safePage} of {safeTotal}
      </span>
      <Button
        type="button"
        variant="outline"
        className="min-h-11"
        disabled={safePage >= safeTotal}
        onClick={() => onPage(safePage + 1)}
      >
        Next
      </Button>
    </div>
  );
}
