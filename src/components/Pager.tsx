import { Button } from "@/components/ui/button";

export default function Pager({
  page,
  totalPages,
  onPage,
}: {
  page: number;
  totalPages: number;
  onPage: (page: number) => void;
}) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="outline"
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
      >
        Previous
      </Button>
      <span className="text-base text-slate-500">
        Page {page} of {totalPages}
      </span>
      <Button
        type="button"
        variant="outline"
        disabled={page >= totalPages}
        onClick={() => onPage(page + 1)}
      >
        Next
      </Button>
    </div>
  );
}
