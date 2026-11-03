"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, btnPrimary, inputCls, ErrorAlert } from "../emails/ui";

type Campaign = {
  id: string;
  name: string;
  description: string | null;
  owner: { id: string; name: string; email: string } | null;
  _count: { emailActivities: number };
  createdAt: string;
};

export default function CampaignsPage() {
  const [items, setItems] = useState<Campaign[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams({
      page: String(page),
      limit: "20",
    });
    if (appliedSearch) params.set("search", appliedSearch);
    api<{ items: Campaign[]; total: number; totalPages: number }>(
      `/api/campaigns?${params}`,
    )
      .then((data) => {
        if (cancelled) return;
        setItems(data.items);
        setTotal(data.total);
        setTotalPages(data.totalPages);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load campaigns");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [page, appliedSearch]);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Campaigns</h1>
          <p className="mt-1 text-sm text-slate-500">
            Tracking groups for outreach. Campaigns here organise recorded
            emails — they do not send anything.
          </p>
        </div>
        <Link href="/campaigns/new" className={btnPrimary}>
          New campaign
        </Link>
      </div>

      <form
        className="mt-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          setAppliedSearch(search.trim());
        }}
      >
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search campaigns…"
          className={inputCls}
        />
        <button type="submit" className={btnPrimary}>
          Search
        </button>
      </form>

      <div className="mt-4">
        <ErrorAlert message={error} />
        {loading ? (
          <p className="text-sm text-slate-500">Loading campaigns…</p>
        ) : items.length === 0 ? (
          <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
            No campaigns yet. Create the first one to group tracked emails.
          </p>
        ) : (
          <>
            <p className="text-xs text-slate-500">{total} campaign(s)</p>
            <ul className="mt-3 space-y-3">
              {items.map((c) => (
                <li key={c.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <Link href={`/campaigns/${c.id}`} className="text-base font-medium text-brand-700 hover:underline">
                    {c.name}
                  </Link>
                  {c.description ? (
                    <p className="mt-1 text-sm text-slate-600">{c.description}</p>
                  ) : null}
                  <p className="mt-2 text-xs text-slate-500">
                    Owner: {c.owner?.name ?? "Unassigned"} · {c._count.emailActivities}{" "}
                    tracked email(s) · Created {new Date(c.createdAt).toLocaleDateString()}
                  </p>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
                className="rounded-md border border-slate-300 bg-white px-3 py-1 text-sm disabled:opacity-50"
              >
                Previous
              </button>
              <span className="text-sm text-slate-500">
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage(page + 1)}
                className="rounded-md border border-slate-300 bg-white px-3 py-1 text-sm disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
