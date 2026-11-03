"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  api,
  btnPrimary,
  btnSecondary,
  inputCls,
  selectCls,
  ErrorAlert,
  StatusBadge,
  EMAIL_STATUSES,
  TERMINAL_STATUSES,
  fmtDate,
  fmtDateTime,
  statusLabel,
} from "./ui";

type Item = {
  id: string;
  subject: string;
  recipientEmail: string;
  senderEmail: string | null;
  status: string;
  sentAt: string | null;
  followUpDate: string | null;
  sequenceNumber: number;
  suppressed: boolean;
  company: { id: string; name: string };
  contact: { id: string; fullName: string } | null;
  campaign: { id: string; name: string } | null;
  assignedTo: { id: string; name: string; email: string } | null;
};
type Option = { id: string; name: string };
type ListData = {
  items: Item[];
  total: number;
  totalPages: number;
  filters: { companies: Option[]; campaigns: Option[]; users: Option[] };
};

const EMPTY = { search: "", status: "", campaignId: "", companyId: "", assignedToId: "", from: "", to: "", followUpsDue: false };

export default function EmailsPage() {
  const [data, setData] = useState<ListData | null>(null);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState(EMPTY);
  const [applied, setApplied] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: "20" });
    if (applied.search) params.set("search", applied.search);
    if (applied.status) params.set("status", applied.status);
    if (applied.campaignId) params.set("campaignId", applied.campaignId);
    if (applied.companyId) params.set("companyId", applied.companyId);
    if (applied.assignedToId) params.set("assignedToId", applied.assignedToId);
    if (applied.from) params.set("from", applied.from);
    if (applied.to) params.set("to", applied.to);
    if (applied.followUpsDue) params.set("followUpsDue", "true");
    api<ListData>(`/api/emails?${params}`)
      .then((d) => {
        if (!cancelled) {
          setData(d);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load emails");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [page, applied]);

  const set = (key: keyof typeof EMPTY, value: string | boolean) =>
    setFilters((f) => ({ ...f, [key]: value }));

  const isDue = (item: Item) => {
    if (!item.followUpDate) return false;
    if (TERMINAL_STATUSES.includes(item.status)) return false;
    return new Date(item.followUpDate) <= new Date();
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Tracked emails</h1>
          <p className="mt-1 text-sm text-slate-500">
            Records of emails sent separately elsewhere. This list tracks
            them — it does not send anything.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/emails/import" className={btnSecondary}>
            Import CSV
          </Link>
          <Link href="/emails/new" className={btnPrimary}>
            Record an email
          </Link>
        </div>
      </div>

      <form
        className="mt-4 grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-4"
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          setApplied(filters);
        }}
      >
        <label className="block text-sm font-medium text-slate-700">
          Search
          <input value={filters.search} onChange={(e) => set("search", e.target.value)} placeholder="Subject, recipient, company…" className={`${inputCls} mt-1`} />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Status
          <select value={filters.status} onChange={(e) => set("status", e.target.value)} className={`${selectCls} mt-1`}>
            <option value="">All statuses</option>
            {EMAIL_STATUSES.map((s) => (
              <option key={s} value={s}>{statusLabel(s)}</option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Campaign
          <select value={filters.campaignId} onChange={(e) => set("campaignId", e.target.value)} className={`${selectCls} mt-1`}>
            <option value="">All campaigns</option>
            {(data?.filters.campaigns ?? []).map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Company
          <select value={filters.companyId} onChange={(e) => set("companyId", e.target.value)} className={`${selectCls} mt-1`}>
            <option value="">All companies</option>
            {(data?.filters.companies ?? []).map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Assigned to
          <select value={filters.assignedToId} onChange={(e) => set("assignedToId", e.target.value)} className={`${selectCls} mt-1`}>
            <option value="">Anyone</option>
            {(data?.filters.users ?? []).map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Sent from
          <input type="date" value={filters.from} onChange={(e) => set("from", e.target.value)} className={`${inputCls} mt-1`} />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Sent to
          <input type="date" value={filters.to} onChange={(e) => set("to", e.target.value)} className={`${inputCls} mt-1`} />
        </label>
        <label className="flex items-end gap-2 pb-2 text-sm text-slate-700">
          <input type="checkbox" checked={filters.followUpsDue} onChange={(e) => set("followUpsDue", e.target.checked)} />
          Follow-ups due (follow-up date ≤ today, no reply/bounce/unsubscribe)
        </label>
        <div className="flex gap-2 sm:col-span-2 lg:col-span-4">
          <button type="submit" className={btnPrimary}>Apply filters</button>
          <button
            type="button"
            className={btnSecondary}
            onClick={() => {
              setFilters(EMPTY);
              setApplied(EMPTY);
              setPage(1);
            }}
          >
            Clear
          </button>
        </div>
      </form>

      <div className="mt-4">
        <ErrorAlert message={error} />
        {loading ? (
          <p className="text-sm text-slate-500">Loading emails…</p>
        ) : !data || data.items.length === 0 ? (
          <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
            No tracked emails match these filters. Record the first one, or
            import sent-email records from CSV.
          </p>
        ) : (
          <>
            <p className="text-xs text-slate-500">{data.total} record(s)</p>
            <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full min-w-[820px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-2">Subject</th>
                    <th className="px-3 py-2">Recipient</th>
                    <th className="px-3 py-2">Company / Campaign</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Sent</th>
                    <th className="px-3 py-2">Follow-up</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((item) => (
                    <tr key={item.id} className="border-b border-slate-100 last:border-0">
                      <td className="px-3 py-2">
                        <Link href={`/emails/${item.id}`} className="font-medium text-brand-700 hover:underline">
                          {item.subject}
                        </Link>
                        <span className="block text-xs text-slate-500">#{item.sequenceNumber} · {item.contact?.fullName ?? "No contact"}</span>
                      </td>
                      <td className="px-3 py-2">{item.recipientEmail}</td>
                      <td className="px-3 py-2">
                        {item.company.name}
                        <span className="block text-xs text-slate-500">{item.campaign?.name ?? "No campaign"}</span>
                      </td>
                      <td className="px-3 py-2"><StatusBadge status={item.status} suppressed={item.suppressed} /></td>
                      <td className="px-3 py-2">{fmtDateTime(item.sentAt)}</td>
                      <td className="px-3 py-2">
                        {item.followUpDate ? (
                          <span className={isDue(item) ? "font-medium text-amber-700" : ""}>
                            {fmtDate(item.followUpDate)}
                            {isDue(item) ? " — due" : ""}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex items-center gap-2">
              <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded-md border border-slate-300 bg-white px-3 py-1 text-sm disabled:opacity-50">
                Previous
              </button>
              <span className="text-sm text-slate-500">Page {page} of {data.totalPages}</span>
              <button type="button" disabled={page >= data.totalPages} onClick={() => setPage(page + 1)} className="rounded-md border border-slate-300 bg-white px-3 py-1 text-sm disabled:opacity-50">
                Next
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
