"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  ResponsiveDialog,
  ErrorDialog,
} from "@/components/ui/responsive-dialog";
import { FieldError, zodFieldErrors } from "@/components/ui/field-error";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePagination } from "@/components/use-pagination";
import Pager from "@/components/Pager";
import { companySchema, contactSchema } from "@/lib/validation";
import { SUPPORTED_CURRENCIES } from "@/lib/currency";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Detail = {
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
    timezone: string | null;
    language: string | null;
    currency: string | null;
    gdprConsentNote: string | null;
    gdprConsent: boolean;
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

async function readError(response: Response, fallback: string): Promise<string> {
  const payload = await response.json().catch(() => null);
  return payload?.error ?? fallback;
}

function fmt(date: string): string {
  return new Date(date).toLocaleString();
}

type PendingConfirm =
  | { kind: "tag"; id: string; name: string }
  | { kind: "contact"; id: string; name: string };

export default function CompanyDetailPage({ params }: { params: { id: string } }) {
  const [company, setCompany] = useState<Detail | null>(null);
  const contactsPagination = usePagination(company?.contacts ?? []);
  const activityPagination = usePagination(company?.activityLog ?? []);
  const emailPagination = usePagination(company?.emailActivities ?? []);
  const followUpPagination = usePagination(company?.followUps ?? []);
  const meetingPagination = usePagination(company?.meetings ?? []);
  const dealPagination = usePagination(company?.deals ?? []);
  const projectPagination = usePagination(company?.projects ?? []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [edit, setEdit] = useState({ status: "", priority: "", city: "", country: "", timezone: "", language: "", currency: "", gdprConsentNote: "", industry: "", description: "" });
  const [editFieldErrors, setEditFieldErrors] = useState<Record<string, string>>({});
  const [editBusy, setEditBusy] = useState(false);
  const [newTag, setNewTag] = useState("");
  const [contactForm, setContactForm] = useState({
    fullName: "",
    jobTitle: "",
    email: "",
    linkedinUrl: "",
    phone: "",
    isDecisionMaker: false,
    notes: "",
    timezone: "",
    language: "",
    currency: "",
    gdprConsentNote: "",
    gdprConsent: false,
  });
  const [contactFieldErrors, setContactFieldErrors] = useState<Record<string, string>>({});
  const [contactBusy, setContactBusy] = useState(false);
  const [confirm, setConfirm] = useState<PendingConfirm | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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
        timezone: data.timezone ?? "",
        language: data.language ?? "",
        currency: data.currency ?? "",
        gdprConsentNote: data.gdprConsentNote ?? "",
        industry: data.industry ?? "",
        description: data.description ?? "",
      });
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load company";
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

  async function saveEdit(event: FormEvent) {
    event.preventDefault();
    if (!company) return;
    setNotice(null);
    setEditFieldErrors({});
    const parsed = companySchema.safeParse({
      name: company.name,
      status: edit.status,
      priority: edit.priority,
      city: edit.city || null,
      country: edit.country || null,
      timezone: edit.timezone || null,
      language: edit.language || null,
      currency: edit.currency || null,
      gdprConsentNote: edit.gdprConsentNote || null,
      industry: edit.industry || null,
      description: edit.description || null,
    });
    if (!parsed.success) {
      setEditFieldErrors(zodFieldErrors(parsed));
      return;
    }
    setEditBusy(true);
    try {
      const response = await fetch(`/api/companies/${params.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(edit),
      });
      if (!response.ok) {
        const message = await readError(response, "Could not save changes");
        setNotice(message);
        toast.error(message);
        return;
      }
      setNotice("Saved.");
      toast.success("Company saved.");
      setEditing(false);
      load();
    } finally {
      setEditBusy(false);
    }
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
      const message = await readError(response, "Could not add tag");
      setNotice(message);
      toast.error(message);
      return;
    }
    setNewTag("");
    toast.success(`Tag "${newTag.trim()}" added.`);
    load();
  }

  async function removeTag(tagId: string) {
    const response = await fetch(`/api/companies/${params.id}/tags`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tagId }),
    });
    if (!response.ok) {
      const message = await readError(response, "Could not remove tag");
      setNotice(message);
      setDeleteError(message);
      toast.error(message);
      return;
    }
    toast.success("Tag removed.");
    load();
  }

  async function addContact(event: FormEvent) {
    event.preventDefault();
    setNotice(null);
    setContactFieldErrors({});
    const parsed = contactSchema.safeParse({
      ...contactForm,
      companyId: params.id,
      linkedinUrl: contactForm.linkedinUrl || null,
    });
    if (!parsed.success) {
      setContactFieldErrors(zodFieldErrors(parsed));
      return;
    }
    setContactBusy(true);
    try {
      const response = await fetch(`/api/companies/${params.id}/contacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(contactForm),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        if (payload && payload.errors && typeof payload.errors === "object") {
          const mapped: Record<string, string> = {};
          for (const [k, v] of Object.entries(payload.errors)) {
            if (typeof v === "string") mapped[k] = v;
          }
          if (Object.keys(mapped).length > 0) {
            setContactFieldErrors(mapped);
            setNotice("Fix the highlighted fields and try again.");
            return;
          }
        }
        const message =
          response.status === 409
            ? "A contact with this email already exists at this company."
            : (payload?.error ?? "Could not add contact");
        setNotice(message);
        toast.error(message);
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
        timezone: "",
        language: "",
        currency: "",
        gdprConsentNote: "",
        gdprConsent: false,
      });
      toast.success("Contact added.");
      load();
    } finally {
      setContactBusy(false);
    }
  }

  async function deleteContact(contactId: string) {
    const response = await fetch(`/api/companies/${params.id}/contacts/${contactId}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      const message = await readError(response, "Could not delete contact");
      setNotice(message);
      setDeleteError(message);
      toast.error(message);
      return;
    }
    toast.success("Contact deleted.");
    load();
  }

  async function runConfirm() {
    if (!confirm) return;
    if (confirm.kind === "tag") await removeTag(confirm.id);
    else await deleteContact(confirm.id);
    setConfirm(null);
  }

  if (loading) {
    return (
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Company</h1>
        <p className="mt-4 text-base text-slate-500">Loading…</p>
      </div>
    );
  }

  if (error || !company) {
    return (
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Company</h1>
        <p role="alert" className="mt-4 rounded-md bg-red-50 px-3 py-2 text-base text-red-700">
          {error ?? "Company not found."}
        </p>
        <Link href="/companies" className="mt-3 inline-block text-base text-brand-600 hover:underline">
          Back to companies
        </Link>
      </div>
    );
  }

  return (
    <div>
      <Link href="/companies" className="text-base text-brand-600 hover:underline">
        ← Back to companies
      </Link>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-slate-900">{company.name}</h1>
        <div className="flex gap-2">
          <Link href={`/follow-ups?companyId=${company.id}`} className="inline-flex min-h-12 items-center rounded-md border border-slate-300 bg-white px-4 py-3 text-base font-medium text-slate-700 hover:bg-slate-100">
            Add follow-up
          </Link>
          <Link href={`/meetings?companyId=${company.id}`} className="inline-flex min-h-12 items-center rounded-md border border-slate-300 bg-white px-4 py-3 text-base font-medium text-slate-700 hover:bg-slate-100">
            Add meeting
          </Link>
          <Link href={`/deals?companyId=${company.id}`} className="inline-flex min-h-12 items-center rounded-md border border-slate-300 bg-white px-4 py-3 text-base font-medium text-slate-700 hover:bg-slate-100">
            Add deal
          </Link>
          <Button type="button" onClick={() => setEditing(true)} variant="default">
            Edit
          </Button>
        </div>
      </div>
      {notice && <p className="mt-3 rounded-md bg-slate-100 px-3 py-2 text-base text-slate-700">{notice}</p>}

      <ResponsiveDialog
        open={editing}
        onOpenChange={setEditing}
        title="Edit company"
        description="Update the company details below."
      >
        <form onSubmit={saveEdit} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Label className="text-base font-medium text-slate-700">
            Status
            <Input value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })} className="mt-1" />
            <FieldError message={editFieldErrors.status} />
          </Label>
          <Label className="text-base font-medium text-slate-700">
            Priority
            <Input value={edit.priority} onChange={(e) => setEdit({ ...edit, priority: e.target.value })} className="mt-1" />
            <FieldError message={editFieldErrors.priority} />
          </Label>
          <Label className="text-base font-medium text-slate-700">
            City
            <Input value={edit.city} onChange={(e) => setEdit({ ...edit, city: e.target.value })} className="mt-1" />
            <FieldError message={editFieldErrors.city} />
          </Label>
          <Label className="text-base font-medium text-slate-700">
            Country
            <Input value={edit.country} onChange={(e) => setEdit({ ...edit, country: e.target.value })} className="mt-1" />
            <FieldError message={editFieldErrors.country} />
          </Label>
          <Label className="text-base font-medium text-slate-700">
            Timezone
            <Input value={edit.timezone} onChange={(e) => setEdit({ ...edit, timezone: e.target.value })} placeholder="e.g. Asia/Karachi, Europe/London, America/New_York" className="mt-1" />
            <FieldError message={editFieldErrors.timezone} />
          </Label>
          <Label className="text-base font-medium text-slate-700">
            Language
            <Input value={edit.language} onChange={(e) => setEdit({ ...edit, language: e.target.value })} placeholder="e.g. English, Spanish" className="mt-1" />
            <FieldError message={editFieldErrors.language} />
          </Label>
          <Label className="text-base font-medium text-slate-700">
            Currency
            <Select value={edit.currency || "none"} onValueChange={(v) => setEdit({ ...edit, currency: v === "none" ? "" : v })}>
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
            <FieldError message={editFieldErrors.currency} />
          </Label>
          <Label className="text-base font-medium text-slate-700 sm:col-span-2">
            GDPR consent note
            <Textarea value={edit.gdprConsentNote} onChange={(e) => setEdit({ ...edit, gdprConsentNote: e.target.value })} rows={2} placeholder="How and when consent was given, if any" className="mt-1" />
            <FieldError message={editFieldErrors.gdprConsentNote} />
          </Label>
          <Label className="text-base font-medium text-slate-700">
            Industry
            <Input value={edit.industry} onChange={(e) => setEdit({ ...edit, industry: e.target.value })} className="mt-1" />
            <FieldError message={editFieldErrors.industry} />
          </Label>
          <Label className="text-base font-medium text-slate-700">
            Description
            <Textarea value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} rows={2} className="mt-1" />
            <FieldError message={editFieldErrors.description} />
          </Label>
          <Button type="submit" disabled={editBusy} className="sm:col-span-2 justify-self-start">
            {editBusy ? "Saving…" : "Save changes"}
          </Button>
        </form>
      </ResponsiveDialog>

      <Tabs defaultValue="overview" className="mt-4">
        <TabsList className="flex flex-wrap justify-start">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="emails">Emails</TabsTrigger>
          <TabsTrigger value="follow-ups">Follow-ups</TabsTrigger>
          <TabsTrigger value="meetings">Meetings</TabsTrigger>
          <TabsTrigger value="deals">Deals</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900">Details</h2>
            <dl className="mt-3 grid grid-cols-1 gap-2 text-base sm:grid-cols-2">
              <div><dt className="text-slate-500">Website</dt><dd className="text-slate-900">{company.website ?? "—"}</dd></div>
              <div><dt className="text-slate-500">Industry</dt><dd className="text-slate-900">{company.industry ?? "—"}</dd></div>
              <div><dt className="text-slate-500">Location</dt><dd className="text-slate-900">{[company.city, company.country].filter(Boolean).join(", ") || "—"}</dd></div>
              <div><dt className="text-slate-500">Timezone</dt><dd className="text-slate-900">{company.timezone ?? "—"}</dd></div>
              <div><dt className="text-slate-500">Language</dt><dd className="text-slate-900">{company.language ?? "—"}</dd></div>
              <div><dt className="text-slate-500">Currency</dt><dd className="text-slate-900">{company.currency ?? "—"}</dd></div>
              <div className="sm:col-span-2"><dt className="text-slate-500">GDPR consent note</dt><dd className="text-slate-900">{company.gdprConsentNote ?? "—"}</dd></div>
              <div><dt className="text-slate-500">Size</dt><dd className="text-slate-900">{company.size ?? "—"}</dd></div>
              <div><dt className="text-slate-500">LinkedIn</dt><dd className="text-slate-900">{company.linkedinUrl ?? "—"}</dd></div>
              <div><dt className="text-slate-500">Source</dt><dd className="text-slate-900">{company.source ?? "—"}</dd></div>
              <div><dt className="text-slate-500">Status / Priority</dt><dd className="text-slate-900">{company.status} / {company.priority}</dd></div>
              <div><dt className="text-slate-500">Assigned to</dt><dd className="text-slate-900">{company.assignedTo?.name ?? "Unassigned"}</dd></div>
              <div className="sm:col-span-2"><dt className="text-slate-500">Description</dt><dd className="text-slate-900">{company.description ?? "—"}</dd></div>
              <div className="sm:col-span-2"><dt className="text-slate-500">Requirements</dt><dd className="text-slate-900">{company.requirements ?? "—"}</dd></div>
              <div className="sm:col-span-2"><dt className="text-slate-500">Research notes</dt><dd className="text-slate-900">{company.researchNotes ?? "—"}</dd></div>
            </dl>
            <div className="mt-4">
              <h3 className="text-base font-medium text-slate-700">Tags</h3>
              <div className="mt-2 flex flex-wrap gap-2">
                {company.tags.length === 0 && <span className="text-base text-slate-500">No tags yet.</span>}
                {company.tags.map((t) => (
                  <span key={t.id} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-sm font-medium text-slate-700">
                    {t.name}
                    <Button type="button" variant="ghost" aria-label={`Remove tag ${t.name}`} onClick={() => setConfirm({ kind: "tag", id: t.id, name: t.name })} className="text-slate-500 hover:text-red-600">
                      ×
                    </Button>
                  </span>
                ))}
              </div>
              <form onSubmit={addTag} className="mt-2 flex gap-2">
                <Input value={newTag} onChange={(e) => setNewTag(e.target.value)} placeholder="New tag (created if missing)" className="max-w-xs" />
                <Button type="submit" variant="outline">Add tag</Button>
              </form>
            </div>
          </section>

          <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900">Contacts</h2>
            {company.contacts.length === 0 ? (
              <p className="mt-2 text-base text-slate-500">No contacts yet.</p>
            ) : (
              <>
              <ul className="mt-3 space-y-2">
                {contactsPagination.pageItems.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-start justify-between gap-2 rounded-md bg-slate-50 px-3 py-2 text-base">
                    <span>
                      <span className="font-medium text-slate-900">{c.fullName}</span>
                      {c.isDecisionMaker && <span className="ml-2 rounded-full bg-brand-100 px-2 py-0.5 text-sm font-medium text-brand-700">Decision maker</span>}
                      <span className="block text-slate-600">
                        {c.jobTitle ?? ""} · {c.email}
                        {c.phone ? ` · ${c.phone}` : ""}
                      </span>
                      <span className="block text-sm text-slate-500">
                        {[c.timezone, c.language, c.currency].filter(Boolean).join(" · ")}
                        {c.gdprConsent ? " · GDPR consent: yes" : " · GDPR consent: no"}
                        {c.gdprConsentNote ? ` · ${c.gdprConsentNote}` : ""}
                      </span>
                      {c.notes && <span className="block text-sm text-slate-500">{c.notes}</span>}
                    </span>
                    <Button type="button" onClick={() => setConfirm({ kind: "contact", id: c.id, name: c.fullName })} className="text-base font-medium text-red-600 hover:underline">
                      Delete
                    </Button>
                  </li>
                ))}
              </ul>
              {company.contacts.length > 0 && <Pager page={contactsPagination.page} totalPages={contactsPagination.totalPages} onPage={contactsPagination.setPage} />}
              </>
            )}
            <form onSubmit={addContact} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Label className="text-base font-medium text-slate-700">
                Full name *
                <Input required value={contactForm.fullName} onChange={(e) => setContactForm({ ...contactForm, fullName: e.target.value })} className="mt-1" />
                <FieldError message={contactFieldErrors.fullName} />
              </Label>
              <Label className="text-base font-medium text-slate-700">
                Email *
                <Input required type="email" value={contactForm.email} onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })} className="mt-1" />
                <FieldError message={contactFieldErrors.email} />
              </Label>
              <Label className="text-base font-medium text-slate-700">
                Job title
                <Input value={contactForm.jobTitle} onChange={(e) => setContactForm({ ...contactForm, jobTitle: e.target.value })} className="mt-1" />
                <FieldError message={contactFieldErrors.jobTitle} />
              </Label>
              <Label className="text-base font-medium text-slate-700">
                Phone
                <Input value={contactForm.phone} onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })} className="mt-1" />
                <FieldError message={contactFieldErrors.phone} />
              </Label>
              <Label className="text-base font-medium text-slate-700">
                LinkedIn URL
                <Input value={contactForm.linkedinUrl} onChange={(e) => setContactForm({ ...contactForm, linkedinUrl: e.target.value })} className="mt-1" />
                <FieldError message={contactFieldErrors.linkedinUrl} />
              </Label>
              <Label className="text-base font-medium text-slate-700">
                Timezone
                <Input value={contactForm.timezone} onChange={(e) => setContactForm({ ...contactForm, timezone: e.target.value })} placeholder="e.g. Asia/Karachi, Europe/London, America/New_York" className="mt-1" />
                <FieldError message={contactFieldErrors.timezone} />
              </Label>
              <Label className="text-base font-medium text-slate-700">
                Language
                <Input value={contactForm.language} onChange={(e) => setContactForm({ ...contactForm, language: e.target.value })} placeholder="e.g. English, Spanish" className="mt-1" />
                <FieldError message={contactFieldErrors.language} />
              </Label>
              <Label className="text-base font-medium text-slate-700">
                Currency
                <Select value={contactForm.currency || "none"} onValueChange={(v) => setContactForm({ ...contactForm, currency: v === "none" ? "" : v })}>
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
                <FieldError message={contactFieldErrors.currency} />
              </Label>
              <Label className="text-base font-medium text-slate-700 sm:col-span-2">
                GDPR consent note
                <Textarea value={contactForm.gdprConsentNote} onChange={(e) => setContactForm({ ...contactForm, gdprConsentNote: e.target.value })} rows={2} placeholder="How and when consent was given, if any" className="mt-1" />
                <FieldError message={contactFieldErrors.gdprConsentNote} />
              </Label>
              <div className="flex items-center gap-2 text-base text-slate-700">
                <Checkbox
                  id="gdpr-consent"
                  checked={contactForm.gdprConsent}
                  onCheckedChange={(v) => setContactForm({ ...contactForm, gdprConsent: v === true })}
                />
                <Label htmlFor="gdpr-consent" className="text-base text-slate-700">
                  GDPR consent given
                </Label>
              </div>
              <div className="flex items-center gap-2 text-base text-slate-700">
                <Checkbox
                  id="decision-maker"
                  checked={contactForm.isDecisionMaker}
                  onCheckedChange={(v) => setContactForm({ ...contactForm, isDecisionMaker: v === true })}
                />
                <Label htmlFor="decision-maker" className="text-base text-slate-700">
                  Decision maker
                </Label>
              </div>
              <Label className="text-base font-medium text-slate-700 sm:col-span-2">
                Notes
                <Textarea value={contactForm.notes} onChange={(e) => setContactForm({ ...contactForm, notes: e.target.value })} rows={2} className="mt-1" />
                <FieldError message={contactFieldErrors.notes} />
              </Label>
              <Button type="submit" disabled={contactBusy} className="justify-self-start">
                {contactBusy ? "Saving…" : "Add contact"}
              </Button>
            </form>
          </section>

          <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900">Activity for this company</h2>
            {company.activityLog.length === 0 ? (
              <p className="mt-2 text-base text-slate-500">No activity recorded yet.</p>
            ) : (
              <>
              <ul className="mt-3 space-y-2 text-base">
                {activityPagination.pageItems.map((a) => (
                  <li key={a.id} className="text-slate-600">
                    <span className="font-medium text-slate-900">{a.actor?.name ?? "System"}</span>
                    {" "}{a.action.replaceAll("_", " ").toLowerCase()} {a.entityType}
                    <span className="text-slate-400"> · {fmt(a.createdAt)}</span>
                  </li>
                ))}
              </ul>
              {company.activityLog.length > 0 && <Pager page={activityPagination.page} totalPages={activityPagination.totalPages} onPage={activityPagination.setPage} />}
              </>
            )}
          </section>
        </TabsContent>

        <TabsContent value="emails" className="mt-4">
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900">Email timeline</h2>
            {company.emailActivities.length === 0 ? (
              <p className="mt-2 text-base text-slate-500">No emails tracked for this company yet.</p>
            ) : (
              <>
              <ul className="mt-3 space-y-2 text-base">
                {emailPagination.pageItems.map((e) => (
                  <li key={e.id} className="text-slate-600">
                    <span className="font-medium text-slate-900">{e.subject}</span>
                    <span className="block text-sm text-slate-500">
                      {fmt(e.createdAt)} · {e.status.replaceAll("_", " ")} → {e.recipientEmail}
                      {e.contact ? ` · ${e.contact.fullName}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
              {company.emailActivities.length > 0 && <Pager page={emailPagination.page} totalPages={emailPagination.totalPages} onPage={emailPagination.setPage} />}
              </>
            )}
          </section>
        </TabsContent>

        <TabsContent value="follow-ups" className="mt-4">
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900">Follow-ups</h2>
            {company.followUps.length === 0 ? (
              <p className="mt-2 text-base text-slate-500">No follow-ups.</p>
            ) : (
              <>
              <ul className="mt-3 space-y-2 text-base">
                {followUpPagination.pageItems.map((f) => (
                  <li key={f.id} className="text-slate-600">
                    {fmt(f.dueDate)} · {f.status}
                    {f.reason ? ` · ${f.reason}` : ""}
                  </li>
                ))}
              </ul>
              {company.followUps.length > 0 && <Pager page={followUpPagination.page} totalPages={followUpPagination.totalPages} onPage={followUpPagination.setPage} />}
              </>
            )}
          </section>
        </TabsContent>

        <TabsContent value="meetings" className="mt-4">
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900">Meetings</h2>
            {company.meetings.length === 0 ? (
              <p className="mt-2 text-base text-slate-500">No meetings.</p>
            ) : (
              <>
              <ul className="mt-3 space-y-2 text-base">
                {meetingPagination.pageItems.map((m) => (
                  <li key={m.id} className="text-slate-600">
                    {m.title} · {fmt(m.dateTime)} · {m.status.replaceAll("_", " ")}
                  </li>
                ))}
              </ul>
              {company.meetings.length > 0 && <Pager page={meetingPagination.page} totalPages={meetingPagination.totalPages} onPage={meetingPagination.setPage} />}
              </>
            )}
          </section>
        </TabsContent>

        <TabsContent value="deals" className="mt-4">
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900">Deals</h2>
            {company.deals.length === 0 ? (
              <p className="mt-2 text-base text-slate-500">No deals.</p>
            ) : (
              <>
              <ul className="mt-3 space-y-2 text-base">
                {dealPagination.pageItems.map((d) => (
                  <li key={d.id} className="text-slate-600">
                    <Link href="/deals" className="font-medium text-brand-600 hover:underline">{d.title}</Link>
                    {" · "}{d.status.replaceAll("_", " ")}
                    {d.estimatedBudget != null ? ` · $${d.estimatedBudget}` : ""}
                  </li>
                ))}
              </ul>
              {company.deals.length > 0 && <Pager page={dealPagination.page} totalPages={dealPagination.totalPages} onPage={dealPagination.setPage} />}
              </>
            )}
            {company.projects.length > 0 && (
              <>
                <h2 className="mt-5 text-base font-semibold text-slate-900">Projects</h2>
                <ul className="mt-3 space-y-2 text-base">
                  {projectPagination.pageItems.map((p) => (
                    <li key={p.id} className="text-slate-600">
                      {p.name} · {p.status.replaceAll("_", " ")}
                    </li>
                  ))}
                </ul>
                {company.projects.length > 0 && <Pager page={projectPagination.page} totalPages={projectPagination.totalPages} onPage={projectPagination.setPage} />}
              </>
            )}
          </section>
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm?.kind === "tag" ? "Remove tag" : "Delete contact"}
        description={
          confirm?.kind === "tag"
            ? `Remove tag "${confirm.name}" from this company?`
            : confirm
              ? `Delete contact "${confirm.name}"?`
              : ""
        }
        confirmLabel="Delete"
        onConfirm={runConfirm}
      />
      <ErrorDialog
        open={!!deleteError}
        onOpenChange={(o) => !o && setDeleteError(null)}
        title="Could not complete that delete"
        message={deleteError ?? ""}
        hint="Check your connection and try again. If the problem persists, the item may already have been removed — reload the page to see the latest state."
      />
    </div>
  );
}
