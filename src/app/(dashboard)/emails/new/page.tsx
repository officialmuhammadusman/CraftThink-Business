"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { FieldError, logicalDateErrors, zodFieldErrors } from "@/components/ui/field-error";
import { emailActivitySchema } from "@/lib/validation";
import {
  api,
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
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
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

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    const parsed = emailActivitySchema.safeParse({
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
      sentAt: sentAt || null,
      followUpDate: followUpDate || null,
      assignedToId: assignedToId || null,
    });
    const logical = logicalDateErrors({ followUpDate: followUpDate || undefined });
    const errors = { ...zodFieldErrors(parsed), ...logical };
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
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
      toast.success("Email recorded.");
      router.push(`/emails/${created.id}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to record email";
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl pb-4">
      <h1 className="text-xl font-semibold text-slate-900">Record an email</h1>
      <p className="mt-1 text-base text-slate-500">
        Tracking only: this records an email that was sent separately through
        Gmail. Nothing here sends an email. If a follow-up date is given, a
        follow-up reminder is created automatically.
      </p>
      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 text-base text-slate-600 shadow-sm">
        {TOKEN_HELP}
      </div>

      <form
        id="record-email-form"
        className="mt-4 space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
        onSubmit={handleSubmit}
      >
        <ErrorAlert message={error} />
        <Field label="Search company">
          <Input
            value={companySearch}
            onChange={(e) => setCompanySearch(e.target.value)}
            placeholder="Type to search companies…"
          />
        </Field>
        <div>
          <Field label="Company *">
            <Select
              value={companyId || "none"}
              onValueChange={(v) => {
                const id = v === "none" ? "" : v;
                setCompanyId(id);
                setContactId("");
              }}
            >
              <SelectTrigger className="min-h-12 text-base">
                <SelectValue placeholder="Select a company…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Select a company…</SelectItem>
                {(lookups?.companies ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}{c.website ? ` (${c.website})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <FieldError message={fieldErrors.companyId} />
        </div>
        <div>
          <Field label="Contact (filtered by company)">
            <Select
              value={contactId || "none"}
              onValueChange={(v) => onContactChange(v === "none" ? "" : v)}
              disabled={!companyId}
            >
              <SelectTrigger className="min-h-12 text-base">
                <SelectValue placeholder="No contact / not listed" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No contact / not listed</SelectItem>
                {contacts.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.fullName} ({c.email})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <FieldError message={fieldErrors.contactId} />
        </div>
        <div>
          <Field label="Campaign (optional)">
            <Select value={campaignId || "none"} onValueChange={(v) => setCampaignId(v === "none" ? "" : v)}>
              <SelectTrigger className="min-h-12 text-base">
                <SelectValue placeholder="No campaign" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No campaign</SelectItem>
                {(lookups?.campaigns ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <FieldError message={fieldErrors.campaignId} />
        </div>
        <div>
          <Field label="Template (optional — prefills subject and body)" hint="Tokens are replaced with the chosen company, contact, and your name.">
            <Select value={templateId || "none"} onValueChange={(v) => onTemplateChange(v === "none" ? "" : v)}>
              <SelectTrigger className="min-h-12 text-base">
                <SelectValue placeholder="No template" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No template</SelectItem>
                {(lookups?.templates ?? []).map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}{t.industry ? ` — ${t.industry}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <FieldError message={fieldErrors.templateId} />
        </div>
        <div>
          <Field label="Recipient email *">
            <Input required type="email" value={recipientEmail} onChange={(e) => setRecipientEmail(e.target.value)} />
          </Field>
          <FieldError message={fieldErrors.recipientEmail} />
        </div>
        <div>
          <Field label="Sender email account" hint="The email account used to send it, e.g. the Gmail address used. Free text — this app does not connect to that account.">
            <Input type="email" value={senderEmail} onChange={(e) => setSenderEmail(e.target.value)} placeholder="you@example.com" />
          </Field>
          <FieldError message={fieldErrors.senderEmail} />
        </div>
        <div>
          <Field label="Subject *">
            <Input required value={subject} onChange={(e) => setSubject(e.target.value)} />
          </Field>
          <FieldError message={fieldErrors.subject} />
        </div>
        <div>
          <Field label="Body *">
            <Textarea required value={body} onChange={(e) => setBody(e.target.value)} rows={8} />
          </Field>
          <FieldError message={fieldErrors.body} />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Date / time sent">
            <Input type="datetime-local" value={sentAt} onChange={(e) => setSentAt(e.target.value)} />
          </Field>
          <div>
            <Field label="Sequence number">
              <Input type="number" min={1} value={sequenceNumber} onChange={(e) => setSequenceNumber(Number(e.target.value) || 1)} />
            </Field>
            <FieldError message={fieldErrors.sequenceNumber} />
          </div>
          <div>
            <Field label="Status *">
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="min-h-12 text-base">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  {EMAIL_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>{s.replaceAll("_", " ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <FieldError message={fieldErrors.status} />
          </div>
          <div>
            <Field label="Follow-up date" hint="Creates a follow-up reminder automatically.">
              <DatePicker value={followUpDate} onChange={setFollowUpDate} placeholder="Pick a date" />
            </Field>
            <FieldError message={fieldErrors.followUpDate} />
          </div>
        </div>
        <div>
          <Field label="Assigned employee">
            <Select value={assignedToId || "none"} onValueChange={(v) => setAssignedToId(v === "none" ? "" : v)}>
              <SelectTrigger className="min-h-12 text-base">
                <SelectValue placeholder="Unassigned" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Unassigned</SelectItem>
                {(lookups?.users ?? []).map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.name} ({u.email})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <FieldError message={fieldErrors.assignedToId} />
        </div>
        <Button type="submit" disabled={saving} variant="default" className="hidden md:inline-flex">
          {saving ? "Recording…" : "Record email"}
        </Button>
      </form>

      <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-10 -mx-4 mt-4 border-t border-slate-200 bg-white px-4 py-3 pb-[env(safe-area-inset-bottom)] md:hidden">
        <Button type="submit" form="record-email-form" disabled={saving} variant="default" className="w-full">
          {saving ? "Recording…" : "Record email"}
        </Button>
      </div>
    </div>
  );
}
