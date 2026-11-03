"use client";

import { Suspense, useCallback, useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";

type FollowUp = {
  id: string;
  dueDate: string;
  reason: string | null;
  notes: string | null;
  status: string;
  company: { id: string; name: string };
  contact: { id: string; fullName: string } | null;
  assignedTo: { id: string; name: string } | null;
};
type Company = { id: string; name: string };
type Contact = { id: string; fullName: string };
type Assignee = { id: string; name: string; role: string };

const selectCls =
  "flex min-h-12 w-full rounded-md border border-slate-300 bg-white px-3 py-3 text-base text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600";

async function readError(response: Response, fallback: string): Promise<string> {
  const payload = await response.json().catch(() => null);
  return payload?.error ?? fallback;
}

function FollowUpsInner() {
  const searchParams = useSearchParams();
  const presetCompany = searchParams.get("companyId") ?? "";
  const [view, setView] = useState<"today" | "overdue" | "upcoming" | "all">("today");
  const [items, setItems] = useState<FollowUp[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [form, setForm] = useState({
    companyId: presetCompany,
    contactId: "",
    dueDate: "",
    reason: "",
    notes: "",
    assignedToId: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/follow-ups?view=${view}&limit=100`);
      if (!response.ok) throw new Error(await readError(response, "Failed to load follow-ups"));
      const payload = await response.json();
      setItems(payload.data.items as FollowUp[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load follow-ups");
    } finally {
      setLoading(false);
    }
  }, [view]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    fetch("/api/companies?limit=100")
      .then((r) => r.json())
      .then((p) => setCompanies(p.data?.items ?? []))
      .catch(() => undefined);
    fetch("/api/companies/assignees")
      .then((r) => r.json())
      .then((p) => setAssignees(p.data?.items ?? []))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!form.companyId) {
      setContacts([]);
      return;
    }
    fetch(`/api/companies/${form.companyId}/contacts`)
      .then((r) => r.json())
      .then((p) => setContacts(p.data?.items ?? []))
      .catch(() => setContacts([]));
  }, [form.companyId]);

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    setNotice(null);
    if (!form.companyId || !form.dueDate) {
      setNotice("Company and due date are required.");
      return;
    }
    const response = await fetch("/api/follow-ups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        companyId: form.companyId,
        contactId: form.contactId || null,
        dueDate: new Date(form.dueDate).toISOString(),
        reason: form.reason || null,
        notes: form.notes || null,
        status: "PENDING",
        assignedToId: form.assignedToId || null,
      }),
    });
    if (!response.ok) {
      setNotice(await readError(response, "Could not create follow-up"));
      return;
    }
    setForm({ ...form, contactId: "", dueDate: "", reason: "", notes: "" });
    setNotice("Follow-up created.");
    load();
  }

  async function markDone(item: FollowUp) {
    const response = await fetch(`/api/follow-ups/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "DONE" }),
    });
    if (!response.ok) {
      setNotice(await readError(response, "Could not update follow-up"));
      return;
    }
    load();
  }

  async function handleDelete(item: FollowUp) {
    if (!window.confirm(`Delete this follow-up for ${item.company.name}?`)) return;
    const response = await fetch(`/api/follow-ups/${item.id}`, { method: "DELETE" });
    if (!response.ok) {
      setNotice(await readError(response, "Could not delete follow-up"));
      return;
    }
    load();
  }

  const views: { value: typeof view; label: string }[] = [
    { value: "today", label: "Today" },
    { value: "overdue", label: "Overdue" },
    { value: "upcoming", label: "Upcoming" },
    { value: "all", label: "All" },
  ];

  return (
    <div>
      <PageHeader
        title="Follow-ups"
        subtitle="One next action per prospect. Overdue is computed from the due date, so a pending item past its date never hides."
      />
      {notice && <p className="mt-4 rounded-md bg-slate-100 px-3 py-3 text-base text-slate-700">{notice}</p>}

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>New follow-up</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="fu-company">Company *</Label>
                <select id="fu-company" required value={form.companyId} onChange={(e) => setForm({ ...form, companyId: e.target.value, contactId: "" })} className={selectCls}>
                  <option value="">Select company…</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="fu-contact">Contact (optional)</Label>
                <select id="fu-contact" value={form.contactId} onChange={(e) => setForm({ ...form, contactId: e.target.value })} className={selectCls}>
                  <option value="">None</option>
                  {contacts.map((c) => (
                    <option key={c.id} value={c.id}>{c.fullName}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="fu-due">Due date *</Label>
                <Input id="fu-due" required type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fu-reason">Reason</Label>
                <Input id="fu-reason" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="e.g. Second email due" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fu-assignee">Assigned to</Label>
                <select id="fu-assignee" value={form.assignedToId} onChange={(e) => setForm({ ...form, assignedToId: e.target.value })} className={selectCls}>
                  <option value="">Me</option>
                  {assignees.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="fu-notes">Notes</Label>
                <Textarea id="fu-notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
              </div>
            </div>
            <Button type="submit" className="w-full sm:w-auto">Create follow-up</Button>
          </form>
        </CardContent>
      </Card>

      <div className="mt-6 flex flex-wrap gap-2" role="group" aria-label="Follow-up view">
        {views.map((v) => (
          <button
            key={v.value}
            type="button"
            onClick={() => setView(v.value)}
            aria-pressed={view === v.value}
            className={`inline-flex min-h-11 items-center rounded-full border px-4 py-2 text-base font-medium ${
              view === v.value
                ? "border-brand-600 bg-brand-600 text-white"
                : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded-md bg-red-50 px-3 py-3 text-base text-red-700">{error}</p>
      )}
      {loading ? (
        <div className="mt-4 space-y-3" aria-label="Loading follow-ups">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
      ) : items.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            image="/images/empty-followups.svg"
            title="No follow-ups in this view"
            description="Create one above so the next action never slips."
          />
        </div>
      ) : (
        <ul className="mt-4 space-y-3">
          {items.map((item) => (
            <li key={item.id}>
              <Card>
                <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between sm:p-6">
                  <div className="min-w-0">
                    <p className="text-base font-medium text-slate-900">
                      {item.company.name}
                      {item.contact && <span className="font-normal text-slate-500"> · {item.contact.fullName}</span>}
                    </p>
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-base text-slate-600">
                      <span>Due {new Date(item.dueDate).toLocaleDateString()}</span>
                      <Badge variant={item.status === "DONE" ? "success" : "warning"}>
                        {item.status.replaceAll("_", " ")}
                      </Badge>
                      {item.assignedTo ? <span>· {item.assignedTo.name}</span> : null}
                      {item.reason ? <span>· {item.reason}</span> : null}
                    </p>
                    {item.notes && <p className="mt-1 text-sm text-slate-500">{item.notes}</p>}
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:shrink-0">
                    {item.status !== "DONE" && (
                      <Button type="button" variant="outline" onClick={() => markDone(item)}>
                        Mark done
                      </Button>
                    )}
                    <Button type="button" variant="ghost" className="text-red-600 hover:text-red-700" onClick={() => handleDelete(item)}>
                      Delete
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function FollowUpsPage() {
  return (
    <Suspense fallback={<p className="text-base text-slate-500">Loading follow-ups…</p>}>
      <FollowUpsInner />
    </Suspense>
  );
}
