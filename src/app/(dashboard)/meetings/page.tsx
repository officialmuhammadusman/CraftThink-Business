"use client";

import { Suspense, useCallback, useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";

type Meeting = {
  id: string;
  title: string;
  dateTime: string;
  platform: string | null;
  link: string | null;
  status: string;
  notes: string | null;
  requirements: string | null;
  budgetNotes: string | null;
  nextSteps: string | null;
  company: { id: string; name: string };
  contact: { id: string; fullName: string } | null;
  assignedTo: { id: string; name: string } | null;
};
type Company = { id: string; name: string };
type Contact = { id: string; fullName: string };
type Assignee = { id: string; name: string; role: string };

const STATUSES = ["SCHEDULED", "COMPLETED", "RESCHEDULED", "CANCELLED", "NO_SHOW"];

const inputCls =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900";
const btnPrimary =
  "rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50";
const btnSecondary =
  "rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50";

async function readError(response: Response, fallback: string): Promise<string> {
  const payload = await response.json().catch(() => null);
  return payload?.error ?? fallback;
}

function MeetingsInner() {
  const searchParams = useSearchParams();
  const presetCompany = searchParams.get("companyId") ?? "";
  const [statusFilter, setStatusFilter] = useState("");
  const [items, setItems] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    companyId: presetCompany,
    contactId: "",
    title: "",
    dateTime: "",
    platform: "",
    link: "",
    assignedToId: "",
    status: "SCHEDULED",
    notes: "",
    requirements: "",
    budgetNotes: "",
    nextSteps: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: "100" });
      if (statusFilter) params.set("status", statusFilter);
      const response = await fetch(`/api/meetings?${params}`);
      if (!response.ok) throw new Error(await readError(response, "Failed to load meetings"));
      const payload = await response.json();
      setItems(payload.data.items as Meeting[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load meetings");
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

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

  function startEdit(item: Meeting) {
    setEditingId(item.id);
    setForm({
      companyId: item.company.id,
      contactId: item.contact?.id ?? "",
      title: item.title,
      dateTime: new Date(item.dateTime).toISOString().slice(0, 16),
      platform: item.platform ?? "",
      link: item.link ?? "",
      assignedToId: item.assignedTo?.id ?? "",
      status: item.status,
      notes: item.notes ?? "",
      requirements: item.requirements ?? "",
      budgetNotes: item.budgetNotes ?? "",
      nextSteps: item.nextSteps ?? "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function resetForm() {
    setEditingId(null);
    setForm({
      companyId: "",
      contactId: "",
      title: "",
      dateTime: "",
      platform: "",
      link: "",
      assignedToId: "",
      status: "SCHEDULED",
      notes: "",
      requirements: "",
      budgetNotes: "",
      nextSteps: "",
    });
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setNotice(null);
    if (!form.companyId || !form.title || !form.dateTime) {
      setNotice("Company, title and date/time are required.");
      return;
    }
    const body = {
      companyId: form.companyId,
      contactId: form.contactId || null,
      title: form.title,
      dateTime: new Date(form.dateTime).toISOString(),
      platform: form.platform || null,
      link: form.link || null,
      assignedToId: form.assignedToId || null,
      status: form.status,
      notes: form.notes || null,
      requirements: form.requirements || null,
      budgetNotes: form.budgetNotes || null,
      nextSteps: form.nextSteps || null,
    };
    const response = await fetch(
      editingId ? `/api/meetings/${editingId}` : "/api/meetings",
      {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    if (!response.ok) {
      setNotice(await readError(response, "Could not save meeting"));
      return;
    }
    setNotice(editingId ? "Meeting updated." : "Meeting created.");
    resetForm();
    load();
  }

  async function changeStatus(item: Meeting, status: string) {
    const response = await fetch(`/api/meetings/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!response.ok) {
      setNotice(await readError(response, "Could not update meeting"));
      return;
    }
    load();
  }

  async function handleDelete(item: Meeting) {
    if (!window.confirm(`Delete meeting "${item.title}"?`)) return;
    const response = await fetch(`/api/meetings/${item.id}`, { method: "DELETE" });
    if (!response.ok) {
      setNotice(await readError(response, "Could not delete meeting"));
      return;
    }
    load();
  }

  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900">Meetings</h1>
      <p className="mt-1 text-sm text-slate-500">
        Booked from replies and deals. Record the outcome, requirements, budget
        notes and next step on every meeting.
      </p>
      {notice && <p className="mt-3 rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-700">{notice}</p>}

      <form onSubmit={handleSubmit} className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">
          {editingId ? "Edit meeting" : "New meeting"}
        </h2>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="text-sm font-medium text-slate-700">
            Company *
            <select required value={form.companyId} onChange={(e) => setForm({ ...form, companyId: e.target.value, contactId: "" })} className={`${inputCls} mt-1 font-normal`}>
              <option value="">Select company…</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">
            Contact (optional)
            <select value={form.contactId} onChange={(e) => setForm({ ...form, contactId: e.target.value })} className={`${inputCls} mt-1 font-normal`}>
              <option value="">None</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>{c.fullName}</option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">
            Title *
            <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={`${inputCls} mt-1 font-normal`} />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Date &amp; time *
            <input required type="datetime-local" value={form.dateTime} onChange={(e) => setForm({ ...form, dateTime: e.target.value })} className={`${inputCls} mt-1 font-normal`} />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Platform
            <input value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value })} placeholder="Google Meet, Zoom…" className={`${inputCls} mt-1 font-normal`} />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Link
            <input value={form.link} onChange={(e) => setForm({ ...form, link: e.target.value })} className={`${inputCls} mt-1 font-normal`} />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Assigned to
            <select value={form.assignedToId} onChange={(e) => setForm({ ...form, assignedToId: e.target.value })} className={`${inputCls} mt-1 font-normal`}>
              <option value="">Me</option>
              {assignees.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">
            Status
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className={`${inputCls} mt-1 font-normal`}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>{s.replaceAll("_", " ")}</option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">
            Requirements
            <textarea value={form.requirements} onChange={(e) => setForm({ ...form, requirements: e.target.value })} rows={2} className={`${inputCls} mt-1 font-normal`} />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Budget notes
            <textarea value={form.budgetNotes} onChange={(e) => setForm({ ...form, budgetNotes: e.target.value })} rows={2} className={`${inputCls} mt-1 font-normal`} />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Notes / outcome
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} className={`${inputCls} mt-1 font-normal`} />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Next steps
            <textarea value={form.nextSteps} onChange={(e) => setForm({ ...form, nextSteps: e.target.value })} rows={2} className={`${inputCls} mt-1 font-normal`} />
          </label>
        </div>
        <div className="mt-4 flex gap-2">
          <button type="submit" className={btnPrimary}>
            {editingId ? "Save changes" : "Create meeting"}
          </button>
          {editingId && (
            <button type="button" onClick={resetForm} className={btnSecondary}>
              Cancel edit
            </button>
          )}
        </div>
      </form>

      <div className="mt-4">
        <label className="text-sm text-slate-500">
          Status{" "}
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900">
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s.replaceAll("_", " ")}</option>
            ))}
          </select>
        </label>
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}
      {loading ? (
        <p className="mt-4 text-sm text-slate-500">Loading meetings…</p>
      ) : items.length === 0 ? (
        <p className="mt-4 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
          No meetings match. Create one above.
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {items.map((item) => (
            <li key={item.id} className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <span className="text-sm">
                  <span className="font-medium text-slate-900">{item.title}</span>
                  <span className="block text-slate-600">
                    {new Date(item.dateTime).toLocaleString()} · {item.company.name}
                    {item.contact ? ` · ${item.contact.fullName}` : ""}
                    {item.platform ? ` · ${item.platform}` : ""}
                    {item.assignedTo ? ` · ${item.assignedTo.name}` : ""}
                  </span>
                  {item.nextSteps && <span className="block text-xs text-slate-500">Next: {item.nextSteps}</span>}
                </span>
                <span className="flex flex-wrap items-center gap-2">
                  <select
                    aria-label={`Status for ${item.title}`}
                    value={item.status}
                    onChange={(e) => changeStatus(item, e.target.value)}
                    className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900"
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>{s.replaceAll("_", " ")}</option>
                    ))}
                  </select>
                  <button type="button" onClick={() => startEdit(item)} className={btnSecondary}>
                    Edit
                  </button>
                  <button type="button" onClick={() => handleDelete(item)} className="text-sm font-medium text-red-600 hover:underline">
                    Delete
                  </button>
                </span>
              </div>
              {item.link && (
                <a href={item.link} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-brand-600 hover:underline">
                  Join link
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function MeetingsPage() {
  return (
    <Suspense fallback={<p className="text-sm text-slate-500">Loading meetings…</p>}>
      <MeetingsInner />
    </Suspense>
  );
}
