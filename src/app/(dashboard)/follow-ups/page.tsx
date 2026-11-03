"use client";

import { Suspense, useCallback, useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";

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
      <h1 className="text-xl font-semibold text-slate-900">Follow-ups</h1>
      <p className="mt-1 text-sm text-slate-500">
        One next action per prospect. Overdue is computed from the due date, so a
        pending item past its date never hides.
      </p>
      {notice && <p className="mt-3 rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-700">{notice}</p>}

      <form onSubmit={handleCreate} className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">New follow-up</h2>
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
            Due date *
            <input required type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} className={`${inputCls} mt-1 font-normal`} />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Reason
            <input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="e.g. Second email due" className={`${inputCls} mt-1 font-normal`} />
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
          <label className="text-sm font-medium text-slate-700 sm:col-span-2">
            Notes
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} className={`${inputCls} mt-1 font-normal`} />
          </label>
        </div>
        <button type="submit" className={`${btnPrimary} mt-4`}>Create follow-up</button>
      </form>

      <div className="mt-4 flex flex-wrap gap-2">
        {views.map((v) => (
          <button
            key={v.value}
            type="button"
            onClick={() => setView(v.value)}
            aria-pressed={view === v.value}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
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
        <p role="alert" className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}
      {loading ? (
        <p className="mt-4 text-sm text-slate-500">Loading follow-ups…</p>
      ) : items.length === 0 ? (
        <p className="mt-4 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
          No follow-ups in this view. Create one above.
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {items.map((item) => (
            <li key={item.id} className="flex flex-wrap items-start justify-between gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
              <span className="text-sm">
                <span className="font-medium text-slate-900">{item.company.name}</span>
                {item.contact && <span className="text-slate-500"> · {item.contact.fullName}</span>}
                <span className="block text-slate-600">
                  Due {new Date(item.dueDate).toLocaleDateString()} · {item.status}
                  {item.assignedTo ? ` · ${item.assignedTo.name}` : ""}
                  {item.reason ? ` · ${item.reason}` : ""}
                </span>
                {item.notes && <span className="block text-xs text-slate-500">{item.notes}</span>}
              </span>
              <span className="flex gap-2">
                {item.status !== "DONE" && (
                  <button type="button" onClick={() => markDone(item)} className={btnSecondary}>
                    Mark done
                  </button>
                )}
                <button type="button" onClick={() => handleDelete(item)} className="text-sm font-medium text-red-600 hover:underline">
                  Delete
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function FollowUpsPage() {
  return (
    <Suspense fallback={<p className="text-sm text-slate-500">Loading follow-ups…</p>}>
      <FollowUpsInner />
    </Suspense>
  );
}
