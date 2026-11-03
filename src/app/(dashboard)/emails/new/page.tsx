"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  api,
  btnPrimary,
  inputCls,
  selectCls,
  Field,
  ErrorAlert,
  EMAIL_STATUSES,
  TOKEN_HELP,
  nowLocalInput,
  fromLocalInput,
  useMe,
} from "../ui";

type Company = { id: string; name: string; website: string | null; industry: string | null };
type Contact = { id: string; fullName: string; email: string };
type Campaign = { id: string; name: string };
type Template = { id: string; name: string; industry: string | null; subject: string; body: string };
type UserOpt = { id: string; name: string; email: string };
type Lookups = {
  companies: Company[];
  contacts: Contact[];
  campaigns: Campaign[];
  templates: Template[];
  users: UserOpt[];
};

function applyTokens(
  text: string,
  values: { company: string; contactName: string; senderName: string },
): string {
  return text
    .replaceAll("{{company}}", values.company)
    .replaceAll("{{contactName}}", values.contactName)
    .replaceAll("{{senderName}}", values.senderName);
}

export default function NewEmailPage() {
  const router = useRouter();
  const { name: myName } = useMe();
  const [lookups, setLookups] = useState<Lookups | null>(null);
  const [companySearch, setCompanySearch] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactId, setContactId] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [senderEmail, setSenderEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sentAt, setSentAt] = useState(nowLocalInput());
  const [sequenceNumber, setSequenceNumber] = useState(1);
  const [status, setStatus] = useState("SENT");
  const [followUpDate, setFollowUpDate] = useState("");
  const [assignedToId, setAssignedToId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Base lookups (campaigns, templates, users, first companies).
  useEffect(() => {
    let cancelled = false;
    api<Lookups>("/api/emails/lookups")
      .then((data) => {
        if (!cancelled) setLookups(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load form data");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Company search (debounced lightly by effect on the search text).
  useEffect(() => {
    if (companySearch.trim() === "") return;
    const timer = setTimeout(() => {
      api<Lookups>(`/api/emails/lookups?search=${encodeURIComponent(companySearch.trim())}`)
        .then((data) => {
          setLookups((prev) =>
            prev ? { ...prev, companies: data.companies } : data,
          );
        })
        .catch(() => undefined);
    }, 300);
    return () => clearTimeout(timer);
  }, [companySearch]);

  // Contacts filtered by the chosen company.
  useEffect(() => {
    if (!companyId) {
      setContacts([]);
      return;
    }
    let cancelled = false;
    api<Lookups>(`/api/emails/lookups?companyId=${companyId}`)
      .then((data) => {
        if (!cancelled) setContacts(data.contacts);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  const selectedCompany = lookups?.companies.find((c) => c.id === companyId);
  const selectedContact = contacts.find((c) => c.id === contactId);

  const onTemplateChange = (id: string) => {
    setTemplateId(id);
    if (!id) return;
    const template = lookups?.templates.find((t) => t.id === id);
    if (!template) return;
    const values = {
      company: selectedCompany?.name ?? "",
      contactName: selectedContact?.fullName ?? "",
      senderName: myName ?? "",
    };
    setSubject(applyTokens(template.subject, values));
    setBody(applyTokens(template.body, values));
  };

  const onContactChange = (id: string) => {
    setContactId(id);
    const contact = contacts.find((c) => c.id === id);
    if (contact) setRecipientEmail(contact.email);
  };

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-semibold text-slate-900">Record an email</h1>
      <p className="mt-1 text-sm text-slate-500">
        Tracking only: this records an email that was sent separately through
        Gmail. Nothing here sends an email. If a follow-up date is given, a
        follow-up reminder is created automatically.
      </p>
      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600 shadow-sm">
        {TOKEN_HELP}
      </div>

      <form
        className="mt-4 space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          if (!companyId) {
            setError("Company is required");
            return;
          }
          setSaving(true);
          try {
            const created = await api<{ id: string }>("/api/emails", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                companyId,
                contactId: contactId || null,
                campaignId: campaignId || null,
                templateId: templateId || null,
                recipientEmail,
                senderEmail: senderEmail || null,
                subject,
                body,
                sequenceNumber,
                status,
                sentAt: fromLocalInput(sentAt),
                followUpDate: followUpDate || null,
                assignedToId: assignedToId || null,
              }),
            });
            router.push(`/emails/${created.id}`);
          } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Failed to record email");
          } finally {
            setSaving(false);
          }
        }}
      >
        <ErrorAlert message={error} />
        <Field label="Search company">
          <input
            value={companySearch}
            onChange={(e) => setCompanySearch(e.target.value)}
            placeholder="Type to search companies…"
            className={inputCls}
          />
        </Field>
        <Field label="Company *">
          <select required value={companyId} onChange={(e) => { setCompanyId(e.target.value); setContactId(""); }} className={selectCls}>
            <option value="">Select a company…</option>
            {(lookups?.companies ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}{c.website ? ` (${c.website})` : ""}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Contact (filtered by company)">
          <select value={contactId} onChange={(e) => onContactChange(e.target.value)} className={selectCls} disabled={!companyId}>
            <option value="">No contact / not listed</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.fullName} ({c.email})
              </option>
            ))}
          </select>
        </Field>
        <Field label="Campaign (optional)">
          <select value={campaignId} onChange={(e) => setCampaignId(e.target.value)} className={selectCls}>
            <option value="">No campaign</option>
            {(lookups?.campaigns ?? []).map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Template (optional — prefills subject and body)" hint="Tokens are replaced with the chosen company, contact, and your name.">
          <select value={templateId} onChange={(e) => onTemplateChange(e.target.value)} className={selectCls}>
            <option value="">No template</option>
            {(lookups?.templates ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}{t.industry ? ` — ${t.industry}` : ""}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Recipient email *">
          <input required type="email" value={recipientEmail} onChange={(e) => setRecipientEmail(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Sender email account" hint="The email account used to send it, e.g. the Gmail address used. Free text — this app does not connect to that account.">
          <input type="email" value={senderEmail} onChange={(e) => setSenderEmail(e.target.value)} placeholder="you@example.com" className={inputCls} />
        </Field>
        <Field label="Subject *">
          <input required value={subject} onChange={(e) => setSubject(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Body *">
          <textarea required value={body} onChange={(e) => setBody(e.target.value)} rows={8} className={inputCls} />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Date / time sent">
            <input type="datetime-local" value={sentAt} onChange={(e) => setSentAt(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Sequence number">
            <input type="number" min={1} value={sequenceNumber} onChange={(e) => setSequenceNumber(Number(e.target.value) || 1)} className={inputCls} />
          </Field>
          <Field label="Status *">
            <select value={status} onChange={(e) => setStatus(e.target.value)} className={selectCls}>
              {EMAIL_STATUSES.map((s) => (
                <option key={s} value={s}>{s.replaceAll("_", " ")}</option>
              ))}
            </select>
          </Field>
          <Field label="Follow-up date" hint="Creates a follow-up reminder automatically.">
            <input type="date" value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} className={inputCls} />
          </Field>
        </div>
        <Field label="Assigned employee">
          <select value={assignedToId} onChange={(e) => setAssignedToId(e.target.value)} className={selectCls}>
            <option value="">Unassigned</option>
            {(lookups?.users ?? []).map((u) => (
              <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
            ))}
          </select>
        </Field>
        <button type="submit" disabled={saving} className={btnPrimary}>
          {saving ? "Recording…" : "Record email"}
        </button>
      </form>
    </div>
  );
}
