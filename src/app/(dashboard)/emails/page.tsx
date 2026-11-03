"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  api,
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
          <p className="mt-1 text-base text-slate-500">
            Records of emails sent separately elsewhere. This list tracks
            them — it does not send anything.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/emails/import" className="inline-flex min-h-12 items-center rounded-md border border-slate-300 bg-white px-4 py-3 text-base font-medium text-slate-700 hover:bg-slate-100">
            Import CSV
          </Link>
          <Link href="/emails/new" className="inline-flex min-h-12 items-center rounded-md bg-brand-600 px-4 py-3 text-base font-medium text-white hover:bg-brand-700">
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
        <Label className="block text-base font-medium text-slate-700">
          Search
          <Input value={filters.search} onChange={(e) => set("search", e.target.value)} placeholder="Subject, recipient, company…" className={`mt-1`} />
        </Label>
        <Label className="block text-base font-medium text-slate-700">
          Status
          <select value={filters.status} onChange={(e) => set("status", e.target.value)} className="mt-1 min-h-12 w-full rounded-md border border-slate-300 bg-white px-3 py-3 text-base">
            <option value="">All statuses</option>
            {EMAIL_STATUSES.map((s) => (
              <option key={s} value={s}>{statusLabel(s)}</option>
            ))}
          </select>
        </Label>
        <Label className="block text-base font-medium text-slate-700">
          Campaign
          <select value={filters.campaignId} onChange={(e) => set("campaignId", e.target.value)} className={`mt-1`}>
            <option value="">All campaigns</option>
            {(data?.filters.campaigns ?? []).map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </Label>
        <Label className="block text-base font-medium text-slate-700">
          Company
          <select value={filters.companyId} onChange={(e) => set("companyId", e.target.value)} className={`mt-1`}>
            <option value="">All companies</option>
            {(data?.filters.companies ?? []).map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </Label>
        <Label className="block text-base font-medium text-slate-700">
          Assigned to
          <select value={filters.assignedToId} onChange={(e) => set("assignedToId", e.target.value)} className={`mt-1`}>
            <option value="">Anyone</option>
            {(data?.filters.users ?? []).map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </Label>
        <Label className="block text-base font-medium text-slate-700">
          Sent from
          <Input type="date" value={filters.from} onChange={(e) => set("from", e.target.value)} className={`mt-1`} />
        </Label>
        <Label className="block text-base font-medium text-slate-700">
          Sent to
          <Input type="date" value={filters.to} onChange={(e) => set("to", e.target.value)} className={`mt-1`} />
        </Label>
        <Label className="flex items-end gap-2 pb-2 text-base text-slate-700">
          <input type="checkbox" checked={filters.followUpsDue} onChange={(e) => set("followUpsDue", e.target.checked)} />
          Follow-ups due (follow-up date ≤ today, no reply/bounce/unsubscribe)
        </Label>
        <div className="flex gap-2 sm:col-span-2 lg:col-span-4">
          <Button type="submit" variant="default">Apply filters</Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setFilters(EMPTY);
              setApplied(EMPTY);
              setPage(1);
            }}
          >
            Clear
          </Button>
        </div>
      </form>

      <div className="mt-4">
        <ErrorAlert message={error} />
        {loading ? (
          <div className="space-y-3" aria-label="Loading emails">
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </div>
        ) : !data || data.items.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center">
              <Image
                src="/images/empty-emails.svg"
                alt=""
                width={320}
                height={220}
                className="mx-auto h-auto w-full max-w-xs"
              />
              <p className="mt-4 text-base text-slate-500">
                No tracked emails match these filters. Record the first one, or
                import sent-email records from CSV.
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            <p className="text-sm text-slate-500">{data.total} record(s)</p>
            <div className="mt-3 grid gap-3 md:hidden">
              {data.items.map((item) => (
                <Card key={item.id}>
                  <CardContent className="p-4">
                    <Link
                      href={`/emails/${item.id}`}
                      className="flex min-h-12 items-center text-base font-medium text-brand-700 hover:underline"
                    >
                      {item.subject}
                    </Link>
                    <p className="text-base text-slate-600">{item.recipientEmail}</p>
                    <p className="text-base text-slate-500">
                      {item.company.name}
                      {item.campaign ? ` · ${item.campaign.name}` : " · No campaign"}
                    </p>
                    <p className="mt-2">
                      <StatusBadge status={item.status} suppressed={item.suppressed} />
                    </p>
                    <p className="mt-2 text-base text-slate-500">
                      Sent {fmtDateTime(item.sentAt)}
                      {item.followUpDate ? ` · Follow-up ${fmtDate(item.followUpDate)}${isDue(item) ? " — due" : ""}` : ""}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
            <div className="mt-3 hidden overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm md:block">
              <Table className="w-full min-w-[820px] text-left text-base">
                <TableHeader>
                  <TableRow className="border-b border-slate-200 text-sm uppercase tracking-wide text-slate-500">
                    <TableHead className="px-3 py-2">Subject</TableHead>
                    <TableHead className="px-3 py-2">Recipient</TableHead>
                    <TableHead className="px-3 py-2">Company / Campaign</TableHead>
                    <TableHead className="px-3 py-2">Status</TableHead>
                    <TableHead className="px-3 py-2">Sent</TableHead>
                    <TableHead className="px-3 py-2">Follow-up</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items.map((item) => (
                    <TableRow key={item.id} className="border-b border-slate-100 last:border-0">
                      <TableCell className="px-3 py-2">
                        <Link href={`/emails/${item.id}`} className="font-medium text-brand-700 hover:underline">
                          {item.subject}
                        </Link>
                        <span className="block text-sm text-slate-500">#{item.sequenceNumber} · {item.contact?.fullName ?? "No contact"}</span>
                      </TableCell>
                      <TableCell className="px-3 py-2">{item.recipientEmail}</TableCell>
                      <TableCell className="px-3 py-2">
                        {item.company.name}
                        <span className="block text-sm text-slate-500">{item.campaign?.name ?? "No campaign"}</span>
                      </TableCell>
                      <TableCell className="px-3 py-2"><StatusBadge status={item.status} suppressed={item.suppressed} /></TableCell>
                      <TableCell className="px-3 py-2">{fmtDateTime(item.sentAt)}</TableCell>
                      <TableCell className="px-3 py-2">
                        {item.followUpDate ? (
                          <span className={isDue(item) ? "font-medium text-amber-700" : ""}>
                            {fmtDate(item.followUpDate)}
                            {isDue(item) ? " — due" : ""}
                          </span>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="mt-4 flex items-center gap-2">
              <Button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} variant="outline">
                Previous
              </Button>
              <span className="text-base text-slate-500">Page {page} of {data.totalPages}</span>
              <Button type="button" disabled={page >= data.totalPages} onClick={() => setPage(page + 1)} variant="outline">
                Next
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
