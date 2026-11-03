"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Company = {
  id: string;
  name: string;
  website: string | null;
  industry: string | null;
  country: string | null;
  city: string | null;
  status: string;
  priority: string;
  assignedTo: { id: string; name: string } | null;
  tags: { id: string; name: string }[];
  _count: { contacts: number; emailActivities: number; deals: number; followUps: number };
};

type Assignee = { id: string; name: string; email: string; role: string };


async function readError(response: Response, fallback: string): Promise<string> {
  const payload = await response.json().catch(() => null);
  return payload?.error ?? fallback;
}

export default function CompaniesPage() {
  const [items, setItems] = useState<Company[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [country, setCountry] = useState("");
  const [industry, setIndustry] = useState("");
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [contacted, setContacted] = useState("");
  const [tag, setTag] = useState("");
  const [tags, setTags] = useState<{ id: string; name: string; companyCount: number }[]>([]);
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formBusy, setFormBusy] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    name: "",
    website: "",
    industry: "",
    country: "",
    city: "",
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
      setError(err instanceof Error ? err.message : "Failed to load companies");
    } finally {
      setLoading(false);
    }
  }, [page, search, country, industry, status, priority, contacted, tag]);

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
        const payload = await response.json().catch(() => null);
        if (response.status === 409 && payload?.data) {
          setFormError(
            `Duplicate: a company named "${payload.data.name}" with that website already exists. Open it instead.`,
          );
        } else {
          setFormError(payload?.error ?? "Could not create company");
        }
        return;
      }
      setForm({
        name: "",
        website: "",
        industry: "",
        country: "",
        city: "",
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
      load();
    } catch {
      setFormError("Could not reach the server. Check your connection and retry.");
    } finally {
      setFormBusy(false);
    }
  }

  async function handleDelete(company: Company) {
    if (
      !window.confirm(
        `Delete "${company.name}"? This is blocked if it still has deals or projects. Contacts, follow-ups and meetings on it will be removed too.`,
      )
    ) {
      return;
    }
    const response = await fetch(`/api/companies/${company.id}`, { method: "DELETE" });
    if (!response.ok) {
      setError(await readError(response, "Could not delete company"));
      return;
    }
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
        setImportResult(await readError(response, "Import failed"));
        return;
      }
      const payload = await response.json();
      const d = payload.data;
      setImportResult(
        `Imported ${d.imported} · skipped ${d.skipped} (no name) · duplicates skipped ${d.duplicates} · total rows ${d.total}.`,
      );
      load();
    } catch {
      setImportResult("Could not reach the server. Check your connection and retry.");
    } finally {
      setImportBusy(false);
    }
  }

  const exportHref = (() => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (country) params.set("country", country);
    if (industry) params.set("industry", industry);
    if (status) params.set("status", status);
    if (priority) params.set("priority", priority);
    if (contacted) params.set("contacted", contacted);
    if (tag) params.set("tag", tag);
    const query = params.toString();
    return query ? `/api/companies/export?${query}` : "/api/companies/export";
  })();

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
          <Button type="button" onClick={() => setShowCreate((v) => !v)} variant="default">
            {showCreate ? "Hide form" : "Add company"}
          </Button>
        </div>
      </div>

      <p className="mt-3 text-base text-slate-500">
        <Link href="/activity-log" className="text-brand-600 hover:underline">
          View activity log
        </Link>
        {" · "}Non-admins see only companies assigned to them or linked to their projects.
      </p>

      {showCreate && (
        <form
          onSubmit={handleCreate}
          className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
        >
          <h2 className="text-base font-semibold text-slate-900">New company</h2>
          {formError && (
            <p role="alert" className="mt-3 rounded-md bg-red-50 px-3 py-2 text-base text-red-700">
              {formError}
            </p>
          )}
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Label className="text-base font-medium text-slate-700">
              Name *
              <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1" />
            </Label>
            <Label className="text-base font-medium text-slate-700">
              Website
              <Input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="https://example.com" className="mt-1" />
            </Label>
            <Label className="text-base font-medium text-slate-700">
              Industry
              <Input value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} className="mt-1" />
            </Label>
            <Label className="text-base font-medium text-slate-700">
              Country
              <Input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} className="mt-1" />
            </Label>
            <Label className="text-base font-medium text-slate-700">
              City
              <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className="mt-1" />
            </Label>
            <Label className="text-base font-medium text-slate-700">
              Size
              <Input value={form.size} onChange={(e) => setForm({ ...form, size: e.target.value })} placeholder="e.g. 11-50" className="mt-1" />
            </Label>
            <Label className="text-base font-medium text-slate-700">
              LinkedIn URL
              <Input value={form.linkedinUrl} onChange={(e) => setForm({ ...form, linkedinUrl: e.target.value })} className="mt-1" />
            </Label>
            <Label className="text-base font-medium text-slate-700">
              Source
              <Input value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} placeholder="LinkedIn, Referral…" className="mt-1" />
            </Label>
            <Label className="text-base font-medium text-slate-700">
              Status
              <Input value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="mt-1" />
            </Label>
            <Label className="text-base font-medium text-slate-700">
              Priority
              <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} className="mt-1 min-h-12 w-full rounded-md border border-slate-300 bg-white px-3 py-3 text-base">
                <option value="LOW">LOW</option>
                <option value="MEDIUM">MEDIUM</option>
                <option value="HIGH">HIGH</option>
              </select>
            </Label>
            <Label className="text-base font-medium text-slate-700">
              Assigned to
              <select value={form.assignedToId} onChange={(e) => setForm({ ...form, assignedToId: e.target.value })} className="mt-1 min-h-12 w-full rounded-md border border-slate-300 bg-white px-3 py-3 text-base">
                <option value="">Unassigned</option>
                {assignees.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.role.replaceAll("_", " ")})
                  </option>
                ))}
              </select>
            </Label>
            <Label className="text-base font-medium text-slate-700 sm:col-span-2">
              Description
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} className="mt-1" />
            </Label>
          </div>
          <Button type="submit" disabled={formBusy} className={`mt-4`}>
            {formBusy ? "Saving…" : "Create company"}
          </Button>
        </form>
      )}

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

      <div className="mt-4 flex flex-wrap gap-2">
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
        <Input value={industry} onChange={(e) => { setIndustry(e.target.value); setPage(1); }} placeholder="Industry" className="min-h-12 rounded-md border border-slate-300 bg-white px-3 py-3 text-base" />
        <Input value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} placeholder="Status" className="min-h-12 rounded-md border border-slate-300 bg-white px-3 py-3 text-base" />
        <select value={priority} onChange={(e) => { setPriority(e.target.value); setPage(1); }} className="min-h-12 rounded-md border border-slate-300 bg-white px-3 py-3 text-base">
          <option value="">Any priority</option>
          <option value="LOW">LOW</option>
          <option value="MEDIUM">MEDIUM</option>
          <option value="HIGH">HIGH</option>
        </select>
        <select value={contacted} onChange={(e) => { setContacted(e.target.value); setPage(1); }} className="min-h-12 rounded-md border border-slate-300 bg-white px-3 py-3 text-base">
          <option value="">Contacted or not</option>
          <option value="true">Contacted</option>
          <option value="false">Not contacted</option>
        </select>
        <select value={tag} onChange={(e) => { setTag(e.target.value); setPage(1); }} className="min-h-12 rounded-md border border-slate-300 bg-white px-3 py-3 text-base">
          <option value="">Any tag</option>
          {tags.map((t) => (
            <option key={t.id} value={t.name}>
              {t.name} ({t.companyCount})
            </option>
          ))}
        </select>
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
                    onClick={() => handleDelete(c)}
                  >
                    Delete
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="mt-4 hidden overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm md:block">
            <Table className="w-full min-w-[720px] text-left text-base">
              <TableHeader>
                <TableRow className="border-b border-slate-200 text-sm uppercase tracking-wide text-slate-500">
                  <TableHead className="px-3 py-2">Company</TableHead>
                  <TableHead className="px-3 py-2">Location</TableHead>
                  <TableHead className="px-3 py-2">Status / Priority</TableHead>
                  <TableHead className="px-3 py-2">Assigned</TableHead>
                  <TableHead className="px-3 py-2">Contacts / Emails / Deals</TableHead>
                  <TableHead className="px-3 py-2">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((c) => (
                  <TableRow key={c.id} className="border-b border-slate-100 last:border-0">
                    <TableCell className="px-3 py-2">
                      <Link href={`/companies/${c.id}`} className="font-medium text-brand-600 hover:underline">
                        {c.name}
                      </Link>
                      <span className="block text-sm text-slate-500">
                        {c.website ?? "—"}
                        {c.tags.length > 0 && ` · ${c.tags.map((t) => t.name).join(", ")}`}
                      </span>
                    </TableCell>
                    <TableCell className="px-3 py-2 text-slate-600">
                      {[c.city, c.country].filter(Boolean).join(", ") || "—"}
                      <span className="block text-sm text-slate-500">{c.industry ?? ""}</span>
                    </TableCell>
                    <TableCell className="px-3 py-2 text-slate-600">
                      <span className="flex flex-wrap gap-1">
                        <Badge>{c.status}</Badge>
                        <Badge variant="secondary">{c.priority}</Badge>
                      </span>
                      <span className="block text-sm text-slate-500">
                        {c._count.emailActivities > 0 ? "Contacted" : "Not contacted"}
                      </span>
                    </TableCell>
                    <TableCell className="px-3 py-2 text-slate-600">{c.assignedTo?.name ?? "—"}</TableCell>
                    <TableCell className="px-3 py-2 text-slate-600">
                      {c._count.contacts} / {c._count.emailActivities} / {c._count.deals}
                    </TableCell>
                    <TableCell className="px-3 py-2">
                      <Button type="button" variant="link" onClick={() => handleDelete(c)} className="text-red-600">
                        Delete
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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
    </div>
  );
}
