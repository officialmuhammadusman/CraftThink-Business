"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";

type Detail = {
  id: string;
  name: string;
  website: string | null;
  industry: string | null;
  country: string | null;
  city: string | null;
  size: string | null;
  linkedinUrl: string | null;
  description: string | null;
  requirements: string | null;
  researchNotes: string | null;
  source: string | null;
  status: string;
  priority: string;
  assignedTo: { id: string; name: string; email: string } | null;
  tags: { id: string; name: string }[];
  contacts: {
    id: string;
    fullName: string;
    jobTitle: string | null;
    email: string;
    linkedinUrl: string | null;
    phone: string | null;
    isDecisionMaker: boolean;
    notes: string | null;
  }[];
  emailActivities: {
    id: string;
    subject: string;
    status: string;
    recipientEmail: string;
    createdAt: string;
    contact: { fullName: string } | null;
  }[];
  followUps: { id: string; dueDate: string; status: string; reason: string | null }[];
  meetings: { id: string; title: string; dateTime: string; status: string }[];
  deals: { id: string; title: string; status: string; estimatedBudget: number | null }[];
  projects: { id: string; name: string; status: string }[];
  activityLog: {
    id: string;
    action: string;
    entityType: string;
    createdAt: string;
    actor: { name: string } | null;
  }[];
};

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

function fmt(date: string): string {
  return new Date(date).toLocaleString();
}

export default function CompanyDetailPage({ params }: { params: { id: string } }) {
  const [company, setCompany] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [edit, setEdit] = useState({ status: "", priority: "", city: "", country: "", industry: "", description: "" });
  const [newTag, setNewTag] = useState("");
  const [contactForm, setContactForm] = useState({
    fullName: "",
    jobTitle: "",
    email: "",
    linkedinUrl: "",
    phone: "",
    isDecisionMaker: false,
    notes: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/companies/${params.id}`);
      if (!response.ok) throw new Error(await readError(response, "Failed to load company"));
      const payload = await response.json();
      const data = payload.data as Detail;
      setCompany(data);
      setEdit({
        status: data.status,
        priority: data.priority,
        city: data.city ?? "",
        country: data.country ?? "",
        industry: data.industry ?? "",
        description: data.description ?? "",
      });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load company");
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

  async function saveEdit(event: FormEvent) {
    event.preventDefault();
    setNotice(null);
    const response = await fetch(`/api/companies/${params.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(edit),
    });
    if (!response.ok) {
      setNotice(await readError(response, "Could not save changes"));
      return;
    }
    setNotice("Saved.");
    setEditing(false);
    load();
  }

  async function addTag(event: FormEvent) {
    event.preventDefault();
    if (!newTag.trim()) return;
    const response = await fetch(`/api/companies/${params.id}/tags`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newTag }),
    });
    if (!response.ok) {
      setNotice(await readError(response, "Could not add tag"));
      return;
    }
    setNewTag("");
    load();
  }

  async function removeTag(tagId: string, name: string) {
    if (!window.confirm(`Remove tag "${name}" from this company?`)) return;
    const response = await fetch(`/api/companies/${params.id}/tags`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tagId }),
    });
    if (!response.ok) {
      setNotice(await readError(response, "Could not remove tag"));
      return;
    }
    load();
  }

  async function addContact(event: FormEvent) {
    event.preventDefault();
    setNotice(null);
    const response = await fetch(`/api/companies/${params.id}/contacts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(contactForm),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      setNotice(
        response.status === 409
          ? "A contact with this email already exists at this company."
          : (payload?.error ?? "Could not add contact"),
      );
      return;
    }
    setContactForm({
      fullName: "",
      jobTitle: "",
      email: "",
      linkedinUrl: "",
      phone: "",
      isDecisionMaker: false,
      notes: "",
    });
    load();
  }

  async function deleteContact(contactId: string, name: string) {
    if (!window.confirm(`Delete contact "${name}"?`)) return;
    const response = await fetch(`/api/companies/${params.id}/contacts/${contactId}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      setNotice(await readError(response, "Could not delete contact"));
      return;
    }
    load();
  }

  if (loading) {
    return (
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Company</h1>
        <p className="mt-4 text-sm text-slate-500">Loading…</p>
      </div>
    );
  }

  if (error || !company) {
    return (
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Company</h1>
        <p role="alert" className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error ?? "Company not found."}
        </p>
        <Link href="/companies" className="mt-3 inline-block text-sm text-brand-600 hover:underline">
          Back to companies
        </Link>
      </div>
    );
  }

  return (
    <div>
      <Link href="/companies" className="text-sm text-brand-600 hover:underline">
        ← Back to companies
      </Link>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-slate-900">{company.name}</h1>
        <div className="flex gap-2">
          <Link href={`/follow-ups?companyId=${company.id}`} className={btnSecondary}>
            Add follow-up
          </Link>
          <Link href={`/meetings?companyId=${company.id}`} className={btnSecondary}>
            Add meeting
          </Link>
          <Link href={`/deals?companyId=${company.id}`} className={btnSecondary}>
            Add deal
          </Link>
          <button type="button" onClick={() => setEditing((v) => !v)} className={btnPrimary}>
            {editing ? "Cancel edit" : "Edit"}
          </button>
        </div>
      </div>
      {notice && <p className="mt-3 rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-700">{notice}</p>}

      <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Details</h2>
        {editing ? (
          <form onSubmit={saveEdit} className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="text-sm font-medium text-slate-700">
              Status
              <input value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })} className={`${inputCls} mt-1 font-normal`} />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Priority
              <input value={edit.priority} onChange={(e) => setEdit({ ...edit, priority: e.target.value })} className={`${inputCls} mt-1 font-normal`} />
            </label>
            <label className="text-sm font-medium text-slate-700">
              City
              <input value={edit.city} onChange={(e) => setEdit({ ...edit, city: e.target.value })} className={`${inputCls} mt-1 font-normal`} />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Country
              <input value={edit.country} onChange={(e) => setEdit({ ...edit, country: e.target.value })} className={`${inputCls} mt-1 font-normal`} />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Industry
              <input value={edit.industry} onChange={(e) => setEdit({ ...edit, industry: e.target.value })} className={`${inputCls} mt-1 font-normal`} />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Description
              <textarea value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} rows={2} className={`${inputCls} mt-1 font-normal`} />
            </label>
            <button type="submit" className={`${btnPrimary} sm:col-span-2 justify-self-start`}>
              Save changes
            </button>
          </form>
        ) : (
          <dl className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            <div><dt className="text-slate-500">Website</dt><dd className="text-slate-900">{company.website ?? "—"}</dd></div>
            <div><dt className="text-slate-500">Industry</dt><dd className="text-slate-900">{company.industry ?? "—"}</dd></div>
            <div><dt className="text-slate-500">Location</dt><dd className="text-slate-900">{[company.city, company.country].filter(Boolean).join(", ") || "—"}</dd></div>
            <div><dt className="text-slate-500">Size</dt><dd className="text-slate-900">{company.size ?? "—"}</dd></div>
            <div><dt className="text-slate-500">LinkedIn</dt><dd className="text-slate-900">{company.linkedinUrl ?? "—"}</dd></div>
            <div><dt className="text-slate-500">Source</dt><dd className="text-slate-900">{company.source ?? "—"}</dd></div>
            <div><dt className="text-slate-500">Status / Priority</dt><dd className="text-slate-900">{company.status} / {company.priority}</dd></div>
            <div><dt className="text-slate-500">Assigned to</dt><dd className="text-slate-900">{company.assignedTo?.name ?? "Unassigned"}</dd></div>
            <div className="sm:col-span-2"><dt className="text-slate-500">Description</dt><dd className="text-slate-900">{company.description ?? "—"}</dd></div>
            <div className="sm:col-span-2"><dt className="text-slate-500">Requirements</dt><dd className="text-slate-900">{company.requirements ?? "—"}</dd></div>
            <div className="sm:col-span-2"><dt className="text-slate-500">Research notes</dt><dd className="text-slate-900">{company.researchNotes ?? "—"}</dd></div>
          </dl>
        )}
        <div className="mt-4">
          <h3 className="text-sm font-medium text-slate-700">Tags</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {company.tags.length === 0 && <span className="text-sm text-slate-500">No tags yet.</span>}
            {company.tags.map((t) => (
              <span key={t.id} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
                {t.name}
                <button type="button" aria-label={`Remove tag ${t.name}`} onClick={() => removeTag(t.id, t.name)} className="text-slate-500 hover:text-red-600">
                  ×
                </button>
              </span>
            ))}
          </div>
          <form onSubmit={addTag} className="mt-2 flex gap-2">
            <input value={newTag} onChange={(e) => setNewTag(e.target.value)} placeholder="New tag (created if missing)" className={`${inputCls} max-w-xs`} />
            <button type="submit" className={btnSecondary}>Add tag</button>
          </form>
        </div>
      </section>

      <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Contacts</h2>
        {company.contacts.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No contacts yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {company.contacts.map((c) => (
              <li key={c.id} className="flex flex-wrap items-start justify-between gap-2 rounded-md bg-slate-50 px-3 py-2 text-sm">
                <span>
                  <span className="font-medium text-slate-900">{c.fullName}</span>
                  {c.isDecisionMaker && <span className="ml-2 rounded-full bg-brand-100 px-2 py-0.5 text-xs font-medium text-brand-700">Decision maker</span>}
                  <span className="block text-slate-600">
                    {c.jobTitle ?? ""} · {c.email}
                    {c.phone ? ` · ${c.phone}` : ""}
                  </span>
                  {c.notes && <span className="block text-xs text-slate-500">{c.notes}</span>}
                </span>
                <button type="button" onClick={() => deleteContact(c.id, c.fullName)} className="text-sm font-medium text-red-600 hover:underline">
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
        <form onSubmit={addContact} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium text-slate-700">
            Full name *
            <input required value={contactForm.fullName} onChange={(e) => setContactForm({ ...contactForm, fullName: e.target.value })} className={`${inputCls} mt-1 font-normal`} />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Email *
            <input required type="email" value={contactForm.email} onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })} className={`${inputCls} mt-1 font-normal`} />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Job title
            <input value={contactForm.jobTitle} onChange={(e) => setContactForm({ ...contactForm, jobTitle: e.target.value })} className={`${inputCls} mt-1 font-normal`} />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Phone
            <input value={contactForm.phone} onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })} className={`${inputCls} mt-1 font-normal`} />
          </label>
          <label className="text-sm font-medium text-slate-700">
            LinkedIn URL
            <input value={contactForm.linkedinUrl} onChange={(e) => setContactForm({ ...contactForm, linkedinUrl: e.target.value })} className={`${inputCls} mt-1 font-normal`} />
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={contactForm.isDecisionMaker} onChange={(e) => setContactForm({ ...contactForm, isDecisionMaker: e.target.checked })} />
            Decision maker
          </label>
          <label className="text-sm font-medium text-slate-700 sm:col-span-2">
            Notes
            <textarea value={contactForm.notes} onChange={(e) => setContactForm({ ...contactForm, notes: e.target.value })} rows={2} className={`${inputCls} mt-1 font-normal`} />
          </label>
          <button type="submit" className={`${btnPrimary} justify-self-start`}>Add contact</button>
        </form>
      </section>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">Email timeline</h2>
          {company.emailActivities.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">No emails tracked for this company yet.</p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {company.emailActivities.map((e) => (
                <li key={e.id} className="text-slate-600">
                  <span className="font-medium text-slate-900">{e.subject}</span>
                  <span className="block text-xs text-slate-500">
                    {fmt(e.createdAt)} · {e.status.replaceAll("_", " ")} → {e.recipientEmail}
                    {e.contact ? ` · ${e.contact.fullName}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">Follow-ups</h2>
          {company.followUps.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">No follow-ups.</p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {company.followUps.map((f) => (
                <li key={f.id} className="text-slate-600">
                  {fmt(f.dueDate)} · {f.status}
                  {f.reason ? ` · ${f.reason}` : ""}
                </li>
              ))}
            </ul>
          )}
          <h2 className="mt-5 text-sm font-semibold text-slate-900">Meetings</h2>
          {company.meetings.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">No meetings.</p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {company.meetings.map((m) => (
                <li key={m.id} className="text-slate-600">
                  {m.title} · {fmt(m.dateTime)} · {m.status.replaceAll("_", " ")}
                </li>
              ))}
            </ul>
          )}
          <h2 className="mt-5 text-sm font-semibold text-slate-900">Deals</h2>
          {company.deals.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">No deals.</p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {company.deals.map((d) => (
                <li key={d.id} className="text-slate-600">
                  <Link href="/deals" className="font-medium text-brand-600 hover:underline">{d.title}</Link>
                  {" · "}{d.status.replaceAll("_", " ")}
                  {d.estimatedBudget != null ? ` · $${d.estimatedBudget}` : ""}
                </li>
              ))}
            </ul>
          )}
          {company.projects.length > 0 && (
            <>
              <h2 className="mt-5 text-sm font-semibold text-slate-900">Projects</h2>
              <ul className="mt-3 space-y-2 text-sm">
                {company.projects.map((p) => (
                  <li key={p.id} className="text-slate-600">
                    {p.name} · {p.status.replaceAll("_", " ")}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>

      <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Activity for this company</h2>
        {company.activityLog.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No activity recorded yet.</p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm">
            {company.activityLog.map((a) => (
              <li key={a.id} className="text-slate-600">
                <span className="font-medium text-slate-900">{a.actor?.name ?? "System"}</span>
                {" "}{a.action.replaceAll("_", " ").toLowerCase()} {a.entityType}
                <span className="text-slate-400"> · {fmt(a.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
