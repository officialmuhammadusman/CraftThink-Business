"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  api,
            Field,
  ErrorAlert,
  StatusBadge,
  EMAIL_STATUSES,
  fmtDate,
  fmtDateTime,
  toLocalInput,
  fromLocalInput,
  statusLabel,
  useMe,
} from "../ui";

type Detail = {
  id: string;
  companyId: string;
  contactId: string | null;
  campaignId: string | null;
  templateId: string | null;
  recipientEmail: string;
  senderEmail: string | null;
  subject: string;
  body: string;
  sequenceNumber: number;
  status: string;
  sentAt: string | null;
  followUpDate: string | null;
  assignedToId: string | null;
  company: { id: string; name: string };
  contact: { id: string; fullName: string } | null;
  campaign: { id: string; name: string } | null;
  template: { id: string; name: string } | null;
  assignedTo: { id: string; name: string; email: string } | null;
  followUps: { id: string; dueDate: string; status: string; reason: string | null }[];
};

export default function EmailDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { role } = useMe();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Edit form state
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [senderEmail, setSenderEmail] = useState("");
  const [sentAt, setSentAt] = useState("");
  const [sequenceNumber, setSequenceNumber] = useState(1);
  const [followUpDate, setFollowUpDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Status update state
  const [newStatus, setNewStatus] = useState("");
  const [notes, setNotes] = useState("");
  const [replySummary, setReplySummary] = useState("");
  const [statusFollowUp, setStatusFollowUp] = useState("");
  const [statusSaving, setStatusSaving] = useState(false);

  const load = () => {
    api<Detail>(`/api/emails/${params.id}`)
      .then((data) => {
        setDetail(data);
        setSubject(data.subject);
        setBody(data.body);
        setRecipientEmail(data.recipientEmail);
        setSenderEmail(data.senderEmail ?? "");
        setSentAt(toLocalInput(data.sentAt));
        setSequenceNumber(data.sequenceNumber);
        setFollowUpDate(data.followUpDate ? data.followUpDate.slice(0, 10) : "");
        setNewStatus(data.status);
        setError(null);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load email record");
      });
  };

  useEffect(load, [params.id]);

  if (error && !detail) {
    return (
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Email record</h1>
        <div className="mt-4"><ErrorAlert message={error} /></div>
      </div>
    );
  }
  if (!detail) return <p className="text-base text-slate-500">Loading email record…</p>;

  const canDelete = role === "SUPER_ADMIN" || role === "ADMIN";

  return (
    <div className="max-w-2xl">
      <Link href="/emails" className="text-base text-brand-700 hover:underline">
        ← All tracked emails
      </Link>
      <h1 className="mt-2 text-xl font-semibold text-slate-900">{detail.subject}</h1>
      <p className="mt-1 text-base text-slate-500">
        {detail.company.name}
        {detail.contact ? ` · ${detail.contact.fullName}` : ""}
        {detail.campaign ? ` · Campaign: ${detail.campaign.name}` : ""}
        {detail.template ? ` · Template: ${detail.template.name}` : ""}
      </p>
      <div className="mt-2"><StatusBadge status={detail.status} /></div>
      {notice ? (
        <p className="mt-3 rounded-md bg-green-50 px-3 py-2 text-base text-green-700">{notice}</p>
      ) : null}

      <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">Update status</h2>
        <p className="mt-1 text-sm text-slate-500">
          Record what happened to this email (reply, bounce, unsubscribe…).
          Marking it Unsubscribed automatically adds the recipient to the
          Suppression list. Marking it Bounced flags it in the list.
        </p>
        <form
          className="mt-3 space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            setNotice(null);
            setStatusSaving(true);
            try {
              await api(`/api/emails/${params.id}/status`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  status: newStatus,
                  notes: notes || null,
                  replySummary: replySummary || null,
                  followUpDate: statusFollowUp || null,
                }),
              });
              setNotes("");
              setReplySummary("");
              setStatusFollowUp("");
              setNotice(`Status updated to ${statusLabel(newStatus)}.`);
              load();
            } catch (err: unknown) {
              setError(err instanceof Error ? err.message : "Failed to update status");
            } finally {
              setStatusSaving(false);
            }
          }}
        >
          <ErrorAlert message={error} />
          <Field label="New status *">
            <select value={newStatus} onChange={(e) => setNewStatus(e.target.value)} className="min-h-12 w-full rounded-md border border-slate-300 bg-white px-3 py-3 text-base">
              {EMAIL_STATUSES.map((s) => (
                <option key={s} value={s}>{statusLabel(s)}</option>
              ))}
            </select>
          </Field>
          <Field label="Notes" hint="Context for the change, stored in the activity log.">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </Field>
          <Field label="Reply summary" hint="What the prospect actually said, in your own words.">
            <Textarea value={replySummary} onChange={(e) => setReplySummary(e.target.value)} rows={2} />
          </Field>
          <Field label="Follow-up date (optional — keeps the reminder in sync)">
            <Input type="date" value={statusFollowUp} onChange={(e) => setStatusFollowUp(e.target.value)} />
          </Field>
          <Button type="submit" disabled={statusSaving} variant="default">
            {statusSaving ? "Updating…" : "Update status"}
          </Button>
        </form>
      </section>

      <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">Edit record</h2>
        <p className="mt-1 text-sm text-slate-500">
          Company, contact, campaign, template, and assignee cannot be changed
          here — they are set when the record is created. Editing the
          follow-up date keeps the linked reminder in sync.
        </p>
        <form
          className="mt-3 space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            setNotice(null);
            setSaving(true);
            try {
              await api(`/api/emails/${params.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  subject,
                  body,
                  recipientEmail,
                  senderEmail: senderEmail || null,
                  sentAt: fromLocalInput(sentAt),
                  sequenceNumber,
                  followUpDate: followUpDate || null,
                }),
              });
              setNotice("Record saved.");
              load();
            } catch (err: unknown) {
              setError(err instanceof Error ? err.message : "Failed to save record");
            } finally {
              setSaving(false);
            }
          }}
        >
          <ErrorAlert message={error} />
          <Field label="Subject *">
            <Input required value={subject} onChange={(e) => setSubject(e.target.value)} />
          </Field>
          <Field label="Body *">
            <Textarea required value={body} onChange={(e) => setBody(e.target.value)} rows={8} />
          </Field>
          <Field label="Recipient email *">
            <Input required type="email" value={recipientEmail} onChange={(e) => setRecipientEmail(e.target.value)} />
          </Field>
          <Field label="Sender email account">
            <Input type="email" value={senderEmail} onChange={(e) => setSenderEmail(e.target.value)} />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Date / time sent">
              <Input type="datetime-local" value={sentAt} onChange={(e) => setSentAt(e.target.value)} />
            </Field>
            <Field label="Sequence number">
              <Input type="number" min={1} value={sequenceNumber} onChange={(e) => setSequenceNumber(Number(e.target.value) || 1)} />
            </Field>
          </div>
          <Field label="Follow-up date">
            <Input type="date" value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} />
          </Field>
          <p className="text-sm text-slate-500">
            Currently assigned to: {detail.assignedTo?.name ?? "Unassigned"} ·
            Sent: {fmtDateTime(detail.sentAt)} · Follow-up: {fmtDate(detail.followUpDate)}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={saving} variant="default">
              {saving ? "Saving…" : "Save changes"}
            </Button>
            {canDelete ? (
              <Button
                type="button"
                disabled={deleting}
                variant="destructive"
                onClick={async () => {
                  if (!window.confirm("Delete this email record? Its pending follow-up reminders are removed too. This cannot be undone.")) return;
                  setDeleting(true);
                  try {
                    await api(`/api/emails/${params.id}`, { method: "DELETE" });
                    router.push("/emails");
                  } catch (err: unknown) {
                    setError(err instanceof Error ? err.message : "Failed to delete record");
                    setDeleting(false);
                  }
                }}
              >
                {deleting ? "Deleting…" : "Delete record"}
              </Button>
            ) : (
              <p className="self-center text-sm text-slate-500">
                Only Admins can delete email records.
              </p>
            )}
            <Link href="/emails" className="inline-flex min-h-12 items-center rounded-md border border-slate-300 bg-white px-4 py-3 text-base font-medium text-slate-700 hover:bg-slate-100">Back to list</Link>
          </div>
        </form>
      </section>

      <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">Linked follow-up reminders</h2>
        {detail.followUps.length === 0 ? (
          <p className="mt-2 text-base text-slate-500">
            No follow-up reminder for this record. Add a follow-up date above
            to create one.
          </p>
        ) : (
          <ul className="mt-2 space-y-2 text-base">
            {detail.followUps.map((f) => (
              <li key={f.id} className="text-slate-600">
                Due {fmtDate(f.dueDate)} · {statusLabel(f.status)}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
