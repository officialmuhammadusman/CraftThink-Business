"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  ResponsiveDialog,
  ErrorDialog,
} from "@/components/ui/responsive-dialog";
import { FieldError, apiErrorMessage, zodFieldErrors } from "@/components/ui/field-error";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { companySchema } from "@/lib/validation";
import { SUPPORTED_CURRENCIES } from "@/lib/currency";
import SavedViewsControl from "@/components/SavedViewsControl";

type Company = {
  id: string;
  name: string;
  website: string | null;
  industry: string | null;
  country: string | null;
  city: string | null;
  timezone: string | null;
  language: string | null;
  currency: string | null;
  gdprConsentNote: string | null;
  status: string;
  priority: string;
  assignedTo: { id: string; name: string } | null;
  tags: { id: string; name: string }[];
  _count: { contacts: number; emailActivities: number; deals: number; followUps: number };
};

type Assignee = { id: string; name: string; email: string; role: string };

async function readError(response: Response, fallback: string): Promise<string> {
  return apiErrorMessage(response, fallback);
}

/** Best-effort: pull a { field: message } map out of a failed response, if any. */
async function readFieldErrors(
  response: Response,
): Promise<Record<string, string> | null> {
  const payload = await response
    .clone()
    .json()
    .catch(() => null);
  const map =
    payload?.errors ?? payload?.fieldErrors ?? payload?.data?.errors ?? null;
  if (map && typeof map === "object" && !Array.isArray(map)) {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(map)) {
      if (typeof v === "string") out[k] = v;
    }
    return Object.keys(out).length > 0 ? out : null;
  }
  return null;
}

export default function CompaniesPage() {
  const [items, setItems] = useState<Company[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [country, setCountry] = useState("");
  const [currency, setCurrency] = useState("");
  const [language, setLanguage] = useState("");
  const [industry, setIndustry] = useState("");
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [contacted, setContacted] = useState("");
  const [tag, setTag] = useState("");
  const [tags, setTags] = useState<{ id: string; name: string; companyCount: number }[]>([]);
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formBusy, setFormBusy] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Company | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    name: "",
    website: "",
    industry: "",
    country: "",
    city: "",
    timezone: "",
    language: "",
    currency: "",
    gdprConsentNote: "",
    size: "",
    linkedinUrl: "",
    description: "",
    source: "",
    status: "NEW",
    priority: "MEDIUM",
    assignedToId: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "20" });
      if (search) params.set("search", search);
      if (country) params.set("country", country);
      if (currency) params.set("currency", currency);
      if (language) params.set("language", language);
      if (industry) params.set("industry", industry);
      if (status) params.set("status", status);
      if (priority) params.set("priority", priority);
      if (contacted) params.set("contacted", contacted);
      if (tag) params.set("tag", tag);
      const response = await fetch(`/api/companies?${params}`);
      if (!response.ok) throw new Error(await readError(response, "Failed to load companies"));
      const payload = await response.json();
      setItems(payload.data.items as Company[]);
      setTotalPages(payload.data.pagination.totalPages as number);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load companies";
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [page, search, country, currency, language, industry, status, priority, contacted, tag]);

  function applySavedFilters(filters: Record<string, string>) {
    setSearch(filters.search ?? "");
    setCountry(filters.country ?? "");
    setCurrency(filters.currency ?? "");
    setLanguage(filters.language ?? "");
    setIndustry(filters.industry ?? "");
    setStatus(filters.status ?? "");
    setPriority(filters.priority ?? "");
    setContacted(filters.contacted ?? "");
    setTag(filters.tag ?? "");
    setPage(1);
  }

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    fetch("/api/companies/tags")
      .then((r) => r.json())
      .then((p) => setTags(p.data?.items ?? []))
      .catch(() => undefined);
    fetch("/api/companies/assignees")
      .then((r) => r.json())
      .then((p) => setAssignees(p.data?.items ?? []))
      .catch(() => undefined);
  }, []);

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    setFieldErrors({});
    const parsed = companySchema.safeParse({
      ...form,
      website: form.website || null,
      linkedinUrl: form.linkedinUrl || null,
      assignedToId: form.assignedToId || null,
    });
    if (!parsed.success) {
      setFieldErrors(zodFieldErrors(parsed));
      return;
    }
    setFormBusy(true);
    try {
      const response = await fetch("/api/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          website: form.website || null,
          assignedToId: form.assignedToId || null,
        }),
      });
      if (!response.ok) {
        const serverFields = await readFieldErrors(response);
        if (serverFields) {
          setFieldErrors(serverFields);
          setFormError("Fix the highlighted fields and try again.");
          return;
        }
        const payload = await response.json().catch(() => null);
        if (response.status === 409 && payload?.data) {
          setFormError(
            `Duplicate: a company named "${payload.data.name}" with that website already exists. Open it instead.`,
          );
        } else {
          const message = payload?.error ?? "Could not create company";
          setFormError(message);
          toast.error(message);
        }
        return;
      }
      setForm({
        name: "",
        website: "",
        industry: "",
        country: "",
        city: "",
        timezone: "",
        language: "",
        currency: "",
        gdprConsentNote: "",
        size: "",
        linkedinUrl: "",
        description: "",
        source: "",
        status: "NEW",
        priority: "MEDIUM",
        assignedToId: "",
      });
      setShowCreate(false);
      setPage(1);
      toast.success("Company created.");
      load();
    } catch {
      const message = "Could not reach the server. Check your connection and retry.";
      setFormError(message);
      toast.error(message);
    } finally {
      setFormBusy(false);
    }
  }

  async function doDelete(company: Company) {
    const response = await fetch(`/api/companies/${company.id}`, { method: "DELETE" });
    if (!response.ok) {
      const message = await readError(response, "Could not delete company");
      setError(message);
      setDeleteError(message);
      toast.error(message);
      return;
    }
    setConfirmDelete(null);
    toast.success(`"${company.name}" deleted.`);
    load();
  }

  async function handleImport(event: FormEvent) {
    event.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setImportResult("Choose a CSV file first.");
      return;
    }
    setImportBusy(true);
    setImportResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/companies/import", {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        const message = await readError(response, "Import failed");
        setImportResult(message);
        toast.error(message);
        return;
      }
      const payload = await response.json();
      const d = payload.data;
      const summary = `Imported ${d.imported} · skipped ${d.skipped} (no name) · duplicates skipped ${d.duplicates} · total rows ${d.total}.`;
      setImportResult(summary);
      toast.success(summary);
      load();
    } catch {
      const message = "Could not reach the server. Check your connection and retry.";
      setImportResult(message);
      toast.error(message);
    } finally {
      setImportBusy(false);
    }
  }

  const exportHref = (() => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (country) params.set("country", country);
    if (currency) params.set("currency", currency);
    if (language) params.set("language", language);
    if (industry) params.set("industry", industry);
    if (status) params.set("status", status);
    if (priority) params.set("priority", priority);
    if (contacted) params.set("contacted", contacted);
    if (tag) params.set("tag", tag);
    const query = params.toString();
    return query ? `/api/companies/export?${query}` : "/api/companies/export";
  })();

  const filterControls = (
    <>
      <Input
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setPage(1);
        }}
        placeholder="Search name, website, city…"
        className="min-h-12 rounded-md border border-slate-300 bg-white px-3 py-3 text-base"
      />
      <Input value={country} onChange={(e) => { setCountry(e.target.value); setPage(1); }} placeholder="Country" className="min-h-12 rounded-md border border-slate-300 bg-white px-3 py-3 text-base" />
      <Select value={currency || "all"} onValueChange={(v) => { setCurrency(v === "all" ? "" : v); setPage(1); }}>
        <SelectTrigger className="min-h-12 text-base">
          <SelectValue placeholder="Any currency" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Any currency</SelectItem>
          {SUPPORTED_CURRENCIES.map((c) => (
            <SelectItem key={c} value={c}>{c}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input value={language} onChange={(e) => { setLanguage(e.target.value); setPage(1); }} placeholder="Language" className="min-h-12 rounded-md border border-slate-300 bg-white px-3 py-3 text-base" />
      <Input value={industry} onChange={(e) => { setIndustry(e.target.value); setPage(1); }} placeholder="Industry" className="min-h-12 rounded-md border border-slate-300 bg-white px-3 py-3 text-base" />
      <Input value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} placeholder="Status" className="min-h-12 rounded-md border border-slate-300 bg-white px-3 py-3 text-base" />
      <Select value={priority || "all"} onValueChange={(v) => { setPriority(v === "all" ? "" : v); setPage(1); }}>
        <SelectTrigger className="min-h-12 text-base">
          <SelectValue placeholder="Any priority" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Any priority</SelectItem>
          <SelectItem value="LOW">LOW</SelectItem>
          <SelectItem value="MEDIUM">MEDIUM</SelectItem>
          <SelectItem value="HIGH">HIGH</SelectItem>
        </SelectContent>
      </Select>
      <Select value={contacted || "all"} onValueChange={(v) => { setContacted(v === "all" ? "" : v); setPage(1); }}>
        <SelectTrigger className="min-h-12 text-base">
          <SelectValue placeholder="Contacted or not" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Contacted or not</SelectItem>
          <SelectItem value="true">Contacted</SelectItem>
          <SelectItem value="false">Not contacted</SelectItem>
        </SelectContent>
      </Select>
      <Select value={tag || "all"} onValueChange={(v) => { setTag(v === "all" ? "" : v); setPage(1); }}>
        <SelectTrigger className="min-h-12 text-base">
          <SelectValue placeholder="Any tag" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Any tag</SelectItem>
          {tags.map((t) => (
            <SelectItem key={t.id} value={t.name}>
              {t.name} ({t.companyCount})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  );

  const columns: DataTableColumn<Company>[] = [
    {
      key: "company",
      label: "Company",
      sortable: true,
      accessor: (c) => c.name,
      render: (c) => (
        <>
          <Link href={`/companies/${c.id}`} className="font-medium text-brand-600 hover:underline">
            {c.name}
          </Link>
          <span className="block text-sm text-slate-500">
            {c.website ?? "—"}
            {c.tags.length > 0 && ` · ${c.tags.map((t) => t.name).join(", ")}`}
          </span>
        </>
      ),
    },
    {
      key: "location",
      label: "Location",
      sortable: true,
      accessor: (c) => [c.city, c.country, c.industry].filter(Boolean).join(" "),
      render: (c) => (
        <>
          {[c.city, c.country].filter(Boolean).join(", ") || "—"}
          <span className="block text-sm text-slate-500">
            {[c.industry, c.currency, c.language, c.timezone].filter(Boolean).join(" · ")}
          </span>
        </>
      ),
    },
    {
      key: "status",
      label: "Status / Priority",
      sortable: true,
      accessor: (c) => c.status,
      render: (c) => (
        <>
          <span className="flex flex-wrap gap-1">
            <Badge>{c.status}</Badge>
            <Badge variant="secondary">{c.priority}</Badge>
          </span>
          <span className="block text-sm text-slate-500">
            {c._count.emailActivities > 0 ? "Contacted" : "Not contacted"}
          </span>
        </>
      ),
    },
    {
      key: "assigned",
      label: "Assigned",
      sortable: true,
      accessor: (c) => c.assignedTo?.name ?? "",
      render: (c) => c.assignedTo?.name ?? "—",
    },
    {
      key: "counts",
      label: "Contacts / Emails / Deals",
      sortable: true,
      accessor: (c) => c._count.contacts,
      render: (c) => `${c._count.contacts} / ${c._count.emailActivities} / ${c._count.deals}`,
    },
    {
      key: "actions",
      label: "Actions",
      render: (c) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="icon" aria-label={`Actions for ${c.name}`}>
              <MoreHorizontal className="size-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link href={`/companies/${c.id}`}>View</Link>
            </DropdownMenuItem>
            <DropdownMenuItem className="text-red-600" onClick={() => setConfirmDelete(c)}>
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Companies</h1>
          <p className="mt-1 text-base text-slate-500">
            Prospects and clients. Duplicates are blocked on name + website.
          </p>
        </div>
        <div className="flex gap-2">
          <a href={exportHref} className="inline-flex min-h-12 items-center rounded-md border border-slate-300 bg-white px-4 py-3 text-base font-medium text-slate-700 hover:bg-slate-100">
            Export CSV
          </a>
          <Button type="button" onClick={() => setShowCreate(true)} variant="default">
            Add company
          </Button>
          <Button type="button" variant="outline" className="md:hidden" onClick={() => setShowFilters(true)}>
            Filters
          </Button>
        </div>
      </div>

      <p className="mt-3 text-base text-slate-500">
        <Link href="/activity-log" className="text-brand-600 hover:underline">
          View activity log
        </Link>
        {" · "}Non-admins see only companies assigned to them or linked to their projects.
      </p>

      <ResponsiveDialog
        open={showCreate}
        onOpenChange={setShowCreate}
        title="New company"
        description="Add a prospect or client. Duplicates are blocked on name + website."
      >
        <form onSubmit={handleCreate} className="space-y-3">
          {formError && (
            <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-base text-red-700">
              {formError}
            </p>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Label className="text-base font-medium text-slate-700">
              Name *
              <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1" />
              <FieldError message={fieldErrors.name} />
            </Label>
            <Label className="text-base font-medium text-slate-700">
              Website
              <Input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="https://example.com" className="mt-1" />
              <FieldError message={fieldErrors.website} />
            </Label>
            <Label className="text-base font-medium text-slate-700">
              Industry
              <Input value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} className="mt-1" />
              <FieldError message={fieldErrors.industry} />
            </Label>
            <Label className="text-base font-medium text-slate-700">
              Country
              <Input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} className="mt-1" />
              <FieldError message={fieldErrors.country} />
            </Label>
            <Label className="text-base font-medium text-slate-700">
              City
              <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className="mt-1" />
              <FieldError message={fieldErrors.city} />
            </Label>
            <Label className="text-base font-medium text-slate-700">
              Timezone
              <Input value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} placeholder="e.g. Asia/Karachi, Europe/London, America/New_York" className="mt-1" />
              <FieldError message={fieldErrors.timezone} />
            </Label>
            <Label className="text-base font-medium text-slate-700">
              Language
              <Input value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value })} placeholder="e.g. English, Spanish" className="mt-1" />
              <FieldError message={fieldErrors.language} />
            </Label>
            <Label className="text-base font-medium text-slate-700">
              Currency
              <Select value={form.currency || "none"} onValueChange={(v) => setForm({ ...form, currency: v === "none" ? "" : v })}>
                <SelectTrigger className="mt-1 min-h-12 text-base">
                  <SelectValue placeholder="Select currency…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No currency</SelectItem>
                  {SUPPORTED_CURRENCIES.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError message={fieldErrors.currency} />
            </Label>
            <Label className="text-base font-medium text-slate-700 sm:col-span-2">
              GDPR consent note
              <Textarea value={form.gdprConsentNote} onChange={(e) => setForm({ ...form, gdprConsentNote: e.target.value })} rows={2} placeholder="How and when consent was given, if any" className="mt-1" />
              <FieldError message={fieldErrors.gdprConsentNote} />
            </Label>
            <Label className="text-base font-medium text-slate-700">
              Size
              <Input value={form.size} onChange={(e) => setForm({ ...form, size: e.target.value })} placeholder="e.g. 11-50" className="mt-1" />
              <FieldError message={fieldErrors.size} />
            </Label>
            <Label className="text-base font-medium text-slate-700">
              LinkedIn URL
              <Input value={form.linkedinUrl} onChange={(e) => setForm({ ...form, linkedinUrl: e.target.value })} className="mt-1" />
              <FieldError message={fieldErrors.linkedinUrl} />
            </Label>
            <Label className="text-base font-medium text-slate-700">
              Source
              <Input value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} placeholder="LinkedIn, Referral…" className="mt-1" />
              <FieldError message={fieldErrors.source} />
            </Label>
            <Label className="text-base font-medium text-slate-700">
              Status
              <Input value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="mt-1" />
              <FieldError message={fieldErrors.status} />
            </Label>
            <Label className="text-base font-medium text-slate-700">
              Priority
              <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                <SelectTrigger className="mt-1 min-h-12 text-base">
                  <SelectValue placeholder="Priority" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="LOW">LOW</SelectItem>
                  <SelectItem value="MEDIUM">MEDIUM</SelectItem>
                  <SelectItem value="HIGH">HIGH</SelectItem>
                </SelectContent>
              </Select>
              <FieldError message={fieldErrors.priority} />
            </Label>
            <Label className="text-base font-medium text-slate-700">
              Assigned to
              <Select value={form.assignedToId || "unassigned"} onValueChange={(v) => setForm({ ...form, assignedToId: v === "unassigned" ? "" : v })}>
                <SelectTrigger className="mt-1 min-h-12 text-base">
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {assignees.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name} ({a.role.replaceAll("_", " ")})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError message={fieldErrors.assignedToId} />
            </Label>
            <Label className="text-base font-medium text-slate-700 sm:col-span-2">
              Description
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} className="mt-1" />
              <FieldError message={fieldErrors.description} />
            </Label>
          </div>
          <Button type="submit" disabled={formBusy}>
            {formBusy ? "Saving…" : "Create company"}
          </Button>
        </form>
      </ResponsiveDialog>

      <ResponsiveDialog
        open={showFilters}
        onOpenChange={setShowFilters}
        title="Filters"
        description="Filters apply immediately to the companies list."
        footer={
          <Button type="button" onClick={() => setShowFilters(false)}>
            Done
          </Button>
        }
      >
        <div className="space-y-3">{filterControls}</div>
      </ResponsiveDialog>

      <form onSubmit={handleImport} className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">Import CSV</h2>
        <p className="mt-1 text-sm text-slate-500">
          Columns: name, website, industry, country, city, size, linkedinUrl, description, source,
          status, priority, contactName, contactEmail, contactJobTitle, contactPhone. Exact
          duplicates are skipped and counted. No email is sent by importing.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="text-base text-slate-700" />
          <Button type="submit" disabled={importBusy} variant="outline">
            {importBusy ? "Importing…" : "Import"}
          </Button>
        </div>
        {importResult && <p className="mt-2 text-base text-slate-700">{importResult}</p>}
      </form>

      <div className="mt-4">
        <SavedViewsControl
          module="companies"
          currentFilters={{
            ...(search ? { search } : {}),
            ...(country ? { country } : {}),
            ...(currency ? { currency } : {}),
            ...(language ? { language } : {}),
            ...(industry ? { industry } : {}),
            ...(status ? { status } : {}),
            ...(priority ? { priority } : {}),
            ...(contacted ? { contacted } : {}),
            ...(tag ? { tag } : {}),
          }}
          onApply={applySavedFilters}
        />
      </div>

      <div className="mt-4 hidden flex-wrap gap-2 md:flex">
        {filterControls}
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded-md bg-red-50 px-3 py-2 text-base text-red-700">
          {error}
        </p>
      )}
      {loading ? (
        <div className="mt-4 space-y-3" aria-label="Loading companies">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      ) : items.length === 0 ? (
        <Card className="mt-4">
          <CardContent className="p-6 text-center">
            <Image
              src="/images/empty-companies.svg"
              alt=""
              width={320}
              height={220}
              className="mx-auto h-auto w-full max-w-xs"
            />
            <p className="mt-4 text-base text-slate-500">
              No companies match. Add one above or import a CSV.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="mt-4 grid gap-3 md:hidden">
            {items.map((c) => (
              <Card key={c.id}>
                <CardContent className="p-4">
                  <Link
                    href={`/companies/${c.id}`}
                    className="flex min-h-12 items-center text-base font-medium text-brand-600 hover:underline"
                  >
                    {c.name}
                  </Link>
                  <p className="text-base text-slate-500">
                    {[c.city, c.country].filter(Boolean).join(", ") || "—"}
                    {c.industry ? ` · ${c.industry}` : ""}
                  </p>
                  <p className="mt-2 flex flex-wrap gap-2">
                    <Badge>{c.status}</Badge>
                    <Badge variant="secondary">{c.priority}</Badge>
                    <Badge variant={c._count.emailActivities > 0 ? "info" : "warning"}>
                      {c._count.emailActivities > 0 ? "Contacted" : "Not contacted"}
                    </Badge>
                  </p>
                  <p className="mt-2 text-base text-slate-600">
                    {c.assignedTo?.name ?? "Unassigned"} · {c._count.contacts} contacts ·{" "}
                    {c._count.emailActivities} emails · {c._count.deals} deals
                  </p>
                  <Button
                    type="button"
                    variant="link"
                    className="mt-1 px-0 text-red-600"
                    onClick={() => setConfirmDelete(c)}
                  >
                    Delete
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="mt-4 hidden md:block">
            <DataTable
              rows={items}
              columns={columns}
              searchPlaceholder="Search within this page…"
              initialPageSize={20}
              emptyMessage="No companies on this page."
            />
          </div>
          <div className="mt-3 flex items-center gap-2 text-base">
            <Button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} variant="outline">
              Previous
            </Button>
            <span className="text-slate-500">
              Page {page} of {totalPages}
            </span>
            <Button type="button" disabled={page >= totalPages} onClick={() => setPage(page + 1)} variant="outline">
              Next
            </Button>
          </div>
        </>
      )}

      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
        title="Delete company"
        description={
          confirmDelete
            ? `Delete "${confirmDelete.name}"? This is blocked if it still has deals or projects. Contacts, follow-ups and meetings on it will be removed too.`
            : ""
        }
        confirmLabel="Delete"
        onConfirm={async () => {
          if (confirmDelete) await doDelete(confirmDelete);
        }}
      />
      <ErrorDialog
        open={!!deleteError}
        onOpenChange={(o) => !o && setDeleteError(null)}
        title="Could not delete company"
        message={deleteError ?? ""}
        hint="If the company still has deals or projects, the delete is blocked — remove those first, then try again. If the problem persists, check your connection and retry."
      />
    </div>
  );
}
