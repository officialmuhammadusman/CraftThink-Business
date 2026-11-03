"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { DatePicker } from "@/components/ui/date-picker";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { DataTable, type DataTableColumn } from "@/components/data-table";
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
  const [showFilters, setShowFilters] = useState(false);

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
        if (!cancelled) {
          const message = err instanceof Error ? err.message : "Failed to load emails";
          setError(message);
          toast.error(message);
        }
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

  const applyFilters = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setApplied(filters);
    setShowFilters(false);
  };

  const isDue = (item: Item) => {
    if (!item.followUpDate) return false;
    if (TERMINAL_STATUSES.includes(item.status)) return false;
    return new Date(item.followUpDate) <= new Date();
  };

  const filterFields = (
    <>
      <Label className="block text-base font-medium text-slate-700">
        Search
        <Input value={filters.search} onChange={(e) => set("search", e.target.value)} placeholder="Subject, recipient, company…" className="mt-1" />
      </Label>
      <Label className="block text-base font-medium text-slate-700">
        Status
        <Select value={filters.status || "all"} onValueChange={(v) => set("status", v === "all" ? "" : v)}>
          <SelectTrigger className="mt-1 min-h-12 text-base">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {EMAIL_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{statusLabel(s)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Label>
      <Label className="block text-base font-medium text-slate-700">
        Campaign
        <Select value={filters.campaignId || "all"} onValueChange={(v) => set("campaignId", v === "all" ? "" : v)}>
          <SelectTrigger className="mt-1 min-h-12 text-base">
            <SelectValue placeholder="All campaigns" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All campaigns</SelectItem>
            {(data?.filters.campaigns ?? []).map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Label>
      <Label className="block text-base font-medium text-slate-700">
        Company
        <Select value={filters.companyId || "all"} onValueChange={(v) => set("companyId", v === "all" ? "" : v)}>
          <SelectTrigger className="mt-1 min-h-12 text-base">
            <SelectValue placeholder="All companies" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All companies</SelectItem>
            {(data?.filters.companies ?? []).map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Label>
      <Label className="block text-base font-medium text-slate-700">
        Assigned to
        <Select value={filters.assignedToId || "all"} onValueChange={(v) => set("assignedToId", v === "all" ? "" : v)}>
          <SelectTrigger className="mt-1 min-h-12 text-base">
            <SelectValue placeholder="Anyone" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Anyone</SelectItem>
            {(data?.filters.users ?? []).map((u) => (
              <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Label>
      <Label className="block text-base font-medium text-slate-700">
        Sent from
        <span className="mt-1 block">
          <DatePicker value={filters.from} onChange={(v) => set("from", v)} placeholder="Pick a date" />
        </span>
      </Label>
      <Label className="block text-base font-medium text-slate-700">
        Sent to
        <span className="mt-1 block">
          <DatePicker value={filters.to} onChange={(v) => set("to", v)} placeholder="Pick a date" />
        </span>
      </Label>
      <div className="flex items-end gap-2 pb-2 text-base text-slate-700">
        <Checkbox
          id="follow-ups-due"
          checked={filters.followUpsDue}
          onCheckedChange={(v) => set("followUpsDue", v === true)}
        />
        <Label htmlFor="follow-ups-due" className="text-base text-slate-700">
          Follow-ups due (follow-up date ≤ today, no reply/bounce/unsubscribe)
        </Label>
      </div>
    </>
  );

  const columns: DataTableColumn<Item>[] = [
    {
      key: "subject",
      label: "Subject",
      sortable: true,
      accessor: (item) => item.subject,
      render: (item) => (
        <>
          <Link href={`/emails/${item.id}`} className="font-medium text-brand-700 hover:underline">
            {item.subject}
          </Link>
          <span className="block text-sm text-slate-500">#{item.sequenceNumber} · {item.contact?.fullName ?? "No contact"}</span>
        </>
      ),
    },
    {
      key: "recipient",
      label: "Recipient",
      sortable: true,
      accessor: (item) => item.recipientEmail,
      render: (item) => item.recipientEmail,
    },
    {
      key: "company",
      label: "Company / Campaign",
      sortable: true,
      accessor: (item) => item.company.name,
      render: (item) => (
        <>
          {item.company.name}
          <span className="block text-sm text-slate-500">{item.campaign?.name ?? "No campaign"}</span>
        </>
      ),
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      accessor: (item) => item.status,
      render: (item) => <StatusBadge status={item.status} suppressed={item.suppressed} />,
    },
    {
      key: "sent",
      label: "Sent",
      sortable: true,
      accessor: (item) => item.sentAt ?? "",
      render: (item) => fmtDateTime(item.sentAt),
    },
    {
      key: "followUp",
      label: "Follow-up",
      sortable: true,
      accessor: (item) => item.followUpDate ?? "",
      render: (item) =>
        item.followUpDate ? (
          <span className={isDue(item) ? "font-medium text-amber-700" : ""}>
            {fmtDate(item.followUpDate)}
            {isDue(item) ? " — due" : ""}
          </span>
        ) : (
          "—"
        ),
    },
  ];

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
          <Button type="button" variant="outline" className="md:hidden" onClick={() => setShowFilters(true)}>
            Filters
          </Button>
          <Link href="/emails/import" className="inline-flex min-h-12 items-center rounded-md border border-slate-300 bg-white px-4 py-3 text-base font-medium text-slate-700 hover:bg-slate-100">
            Import CSV
          </Link>
          <Link href="/emails/new" className="inline-flex min-h-12 items-center rounded-md bg-brand-600 px-4 py-3 text-base font-medium text-white hover:bg-brand-700">
            Record an email
          </Link>
        </div>
      </div>

      <form
        className="mt-4 hidden grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 md:grid lg:grid-cols-4"
        onSubmit={applyFilters}
      >
        {filterFields}
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

      <ResponsiveDialog
        open={showFilters}
        onOpenChange={setShowFilters}
        title="Filters"
        description="Apply filters to narrow the tracked emails list."
      >
        <form onSubmit={applyFilters} className="space-y-3">
          {filterFields}
          <div className="flex gap-2">
            <Button type="submit" variant="default">Apply filters</Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setFilters(EMPTY);
                setApplied(EMPTY);
                setPage(1);
                setShowFilters(false);
              }}
            >
              Clear
            </Button>
          </div>
        </form>
      </ResponsiveDialog>

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
            <div className="mt-3 hidden md:block">
              <DataTable
                rows={data.items}
                columns={columns}
                searchPlaceholder="Search within this page…"
                initialPageSize={20}
                emptyMessage="No tracked emails on this page."
              />
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
