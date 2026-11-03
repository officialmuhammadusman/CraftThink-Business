"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, btnPrimary, inputCls, ErrorAlert, TOKEN_HELP } from "../emails/ui";

type Template = {
  id: string;
  name: string;
  industry: string | null;
  subject: string;
  body: string;
};

export default function TemplatesPage() {
  const [items, setItems] = useState<Template[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [industry, setIndustry] = useState("");
  const [applied, setApplied] = useState({ search: "", industry: "" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: "20" });
    if (applied.search) params.set("search", applied.search);
    if (applied.industry) params.set("industry", applied.industry);
    api<{ items: Template[]; total: number; totalPages: number }>(
      `/api/templates?${params}`,
    )
      .then((data) => {
        if (cancelled) return;
        setItems(data.items);
        setTotal(data.total);
        setTotalPages(data.totalPages);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load templates");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [page, applied]);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Email templates</h1>
          <p className="mt-1 text-sm text-slate-500">
            Shared templates for industry outreach. Templates only prefill a
            recorded email — they never send anything.
          </p>
        </div>
        <Link href="/templates/new" className={btnPrimary}>
          New template
        </Link>
      </div>

      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600 shadow-sm">
        {TOKEN_HELP}
      </div>

      <form
        className="mt-4 flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          setApplied({ search: search.trim(), industry: industry.trim() });
        }}
      >
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search templates…" className={`${inputCls} flex-1`} />
        <input value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="Industry filter" className={inputCls} />
        <button type="submit" className={btnPrimary}>Search</button>
      </form>

      <div className="mt-4">
        <ErrorAlert message={error} />
        {loading ? (
          <p className="text-sm text-slate-500">Loading templates…</p>
        ) : items.length === 0 ? (
          <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
            No templates yet. Create the first one for an industry you target.
          </p>
        ) : (
          <>
            <p className="text-xs text-slate-500">{total} template(s)</p>
            <ul className="mt-3 space-y-3">
              {items.map((t) => (
                <li key={t.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <Link href={`/templates/${t.id}`} className="text-base font-medium text-brand-700 hover:underline">
                    {t.name}
                  </Link>
                  <p className="mt-1 text-xs text-slate-500">
                    Industry: {t.industry ?? "Any"} · Subject: {t.subject}
                  </p>
                  <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm text-slate-600">{t.body}</p>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex items-center gap-2">
              <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded-md border border-slate-300 bg-white px-3 py-1 text-sm disabled:opacity-50">
                Previous
              </button>
              <span className="text-sm text-slate-500">Page {page} of {totalPages}</span>
              <button type="button" disabled={page >= totalPages} onClick={() => setPage(page + 1)} className="rounded-md border border-slate-300 bg-white px-3 py-1 text-sm disabled:opacity-50">
                Next
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
