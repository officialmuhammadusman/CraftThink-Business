import Link from "next/link";
import type { ReactNode } from "react";

export default function PageHeader({
  title,
  subtitle,
  action,
  backHref,
  backLabel,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        {backHref ? (
          <Link
            href={backHref}
            className="inline-flex min-h-12 items-center text-base font-medium text-brand-600 hover:underline"
          >
            ← {backLabel ?? "Back"}
          </Link>
        ) : null}
        <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
        {subtitle ? (
          <p className="mt-1 max-w-2xl text-base text-slate-500">{subtitle}</p>
        ) : null}
      </div>
      {action ? <div className="flex shrink-0 flex-wrap gap-2">{action}</div> : null}
    </div>
  );
}
