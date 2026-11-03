"use client";

import { Suspense, useCallback, useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ErrorDialog } from "@/components/ui/responsive-dialog";
import { FieldError, zodFieldErrors } from "@/components/ui/field-error";
import { meetingSchema } from "@/lib/validation";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";

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
  "flex min-h-12 w-full rounded-md border border-slate-300 bg-white px-3 py-3 text-base text-slate-900";

function meetingBadgeVariant(status: string): "success" | "destructive" | "warning" | "info" | "secondary" {
  if (status === "COMPLETED") return "success";
  if (status === "CANCELLED" || status === "NO_SHOW") return "destructive";
  if (status === "RESCHEDULED") return "warning";
  if (status === "SCHEDULED") return "info";
  return "secondary";
}

async function readError(response: Response, fallback: string): Promise<string> {
  const payload = await response.json().catch(() => null);
  return payload?.error ?? payload?.message ?? fallback;
}

/** Server-named field errors (fieldErrors / errors object) mapped onto fields. */
function serverFieldErrors(payload: unknown): Record<string, string> | null {
  if (!payload || typeof payload !== "object") return null;
  const rec = (payload as Record<string, unknown>).fieldErrors ?? (payload as Record<string, unknown>).errors;
  if (!rec || typeof rec !== "object" || Array.isArray(rec)) return null;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(rec as Record<string, unknown>)) {
    if (typeof v === "string") out[k] = v;
    else if (Array.isArray(v) && typeof v[0] === "string") out[k] = v[0];
  }
  return Object.keys(out).length > 0 ? out : null;
}

function MeetingsInner() {
  const searchParams = useSearchParams();
  const presetCompany = searchParams.get("companyId") ?? "";
  const [statusFilter, setStatusFilter] = useState("");
  const [items, setItems] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [confirmItem, setConfirmItem] = useState<Meeting | null>(null);
  const [errorDialog, setErrorDialog] = useState<string | null>(null);
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
      const message = err instanceof Error ? err.message : "Failed to load meetings";
      setError(message);
      toast.error(message);
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
    const parsed = meetingSchema.safeParse({
      companyId: form.companyId,
      contactId: form.contactId || null,
      title: form.title,
      dateTime: form.dateTime,
      platform: form.platform || null,
      link: form.link || null,
      assignedToId: form.assignedToId || null,
      status: form.status,
      notes: form.notes || null,
      requirements: form.requirements || null,
      budgetNotes: form.budgetNotes || null,
      nextSteps: form.nextSteps || null,
    });
    const errs = zodFieldErrors(parsed);
    if (!form.dateTime) errs.dateTime = "Date and time is required.";
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      return;
    }
    setFieldErrors({});
    setSubmitting(true);
    try {
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
        const payload = await response.json().catch(() => null);
        const mapped = serverFieldErrors(payload);
        const message = payload?.error ?? payload?.message ?? "Could not save meeting";
        if (mapped) {
          setFieldErrors(mapped);
          toast.error("Please fix the highlighted fields.");
        } else {
          toast.error(message);
        }
        return;
      }
      toast.success(editingId ? "Meeting updated." : "Meeting created.");
      resetForm();
      load();
    } finally {
      setSubmitting(false);
    }
  }

  async function changeStatus(item: Meeting, status: string) {
    const response = await fetch(`/api/meetings/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!response.ok) {
      toast.error(await readError(response, "Could not update meeting"));
      return;
    }
    toast.success("Meeting status updated.");
    load();
  }

  async function handleDelete(item: Meeting) {
    const response = await fetch(`/api/meetings/${item.id}`, { method: "DELETE" });
    if (!response.ok) {
      const message = await readError(response, "Could not delete meeting");
      toast.error(message);
      setErrorDialog(message);
      return;
    }
    toast.success("Meeting deleted.");
    load();
  }

  return (
    <div>
      <PageHeader
        title="Meetings"
        subtitle="Booked from replies and deals. Record the outcome, requirements, budget notes and next step on every meeting."
      />
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>{editingId ? "Edit meeting" : "New meeting"}</CardTitle>
        </CardHeader>
        <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="block space-y-2 text-base font-medium text-slate-700">
            Company *
            <Select value={form.companyId || "__none"} onValueChange={(v) => setForm({ ...form, companyId: v === "__none" ? "" : v, contactId: "" })}>
              <SelectTrigger><SelectValue placeholder="Select company…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">Select company…</SelectItem>
                {companies.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldError message={fieldErrors.companyId} />
          </label>
          <label className="block space-y-2 text-base font-medium text-slate-700">
            Contact (optional)
            <Select value={form.contactId || "__none"} onValueChange={(v) => setForm({ ...form, contactId: v === "__none" ? "" : v })}>
              <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">None</SelectItem>
                {contacts.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.fullName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldError message={fieldErrors.contactId} />
          </label>
          <label className="block space-y-2 text-base font-medium text-slate-700">
            Title *
            <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={inputCls} />
            <FieldError message={fieldErrors.title} />
          </label>
          <label className="block space-y-2 text-base font-medium text-slate-700">
            Date &amp; time *
            <input required type="datetime-local" value={form.dateTime} onChange={(e) => setForm({ ...form, dateTime: e.target.value })} className={inputCls} />
            <FieldError message={fieldErrors.dateTime} />
          </label>
          <label className="block space-y-2 text-base font-medium text-slate-700">
            Platform
            <input value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value })} placeholder="Google Meet, Zoom…" className={inputCls} />
            <FieldError message={fieldErrors.platform} />
          </label>
          <label className="block space-y-2 text-base font-medium text-slate-700">
            Link
            <input value={form.link} onChange={(e) => setForm({ ...form, link: e.target.value })} className={inputCls} />
            <FieldError message={fieldErrors.link} />
          </label>
          <label className="block space-y-2 text-base font-medium text-slate-700">
            Assigned to
            <Select value={form.assignedToId || "__none"} onValueChange={(v) => setForm({ ...form, assignedToId: v === "__none" ? "" : v })}>
              <SelectTrigger><SelectValue placeholder="Me" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">Me</SelectItem>
                {assignees.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldError message={fieldErrors.assignedToId} />
          </label>
          <label className="block space-y-2 text-base font-medium text-slate-700">
            Status
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>{s.replaceAll("_", " ")}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldError message={fieldErrors.status} />
          </label>
          <label className="block space-y-2 text-base font-medium text-slate-700">
            Requirements
            <textarea value={form.requirements} onChange={(e) => setForm({ ...form, requirements: e.target.value })} rows={2} className={inputCls} />
            <FieldError message={fieldErrors.requirements} />
          </label>
          <label className="block space-y-2 text-base font-medium text-slate-700">
            Budget notes
            <textarea value={form.budgetNotes} onChange={(e) => setForm({ ...form, budgetNotes: e.target.value })} rows={2} className={inputCls} />
            <FieldError message={fieldErrors.budgetNotes} />
          </label>
          <label className="block space-y-2 text-base font-medium text-slate-700">
            Notes / outcome
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} className={inputCls} />
            <FieldError message={fieldErrors.notes} />
          </label>
          <label className="block space-y-2 text-base font-medium text-slate-700">
            Next steps
            <textarea value={form.nextSteps} onChange={(e) => setForm({ ...form, nextSteps: e.target.value })} rows={2} className={inputCls} />
            <FieldError message={fieldErrors.nextSteps} />
          </label>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button type="submit" disabled={submitting} className="w-full sm:w-auto">
            {submitting ? "Saving…" : editingId ? "Save changes" : "Create meeting"}
          </Button>
          {editingId && (
            <Button type="button" variant="outline" onClick={resetForm}>
              Cancel edit
            </Button>
          )}
        </div>
        </form>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardContent className="space-y-2 p-4 sm:p-6">
        <Label htmlFor="meeting-status-filter">Status filter</Label>
          <Select value={statusFilter || "all"} onValueChange={(v) => setStatusFilter(v === "all" ? "" : v)}>
            <SelectTrigger id="meeting-status-filter"><SelectValue placeholder="All statuses" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s}>{s.replaceAll("_", " ")}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {error && (
        <p role="alert" className="mt-4 rounded-md bg-red-50 px-3 py-3 text-base text-red-700">{error}</p>
      )}
      {loading ? (
        <div className="mt-4 space-y-3" aria-label="Loading meetings">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
      ) : items.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            image="/images/empty-meetings.svg"
            title="No meetings match"
            description="Create one above to book the next conversation."
            action={
              <Button type="button" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
                Create a meeting
              </Button>
            }
          />
        </div>
      ) : (
        <ul className="mt-4 space-y-3">
          {items.map((item) => (
            <li key={item.id}>
              <Card>
                <CardContent className="space-y-3 p-4 sm:p-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="text-base font-medium text-slate-900">{item.title}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-2 text-base text-slate-600">
                    <span>
                    {new Date(item.dateTime).toLocaleString()} · {item.company.name}
                    {item.contact ? ` · ${item.contact.fullName}` : ""}
                    {item.platform ? ` · ${item.platform}` : ""}
                    {item.assignedTo ? ` · ${item.assignedTo.name}` : ""}
                    </span>
                    <Badge variant={meetingBadgeVariant(item.status)}>{item.status.replaceAll("_", " ")}</Badge>
                  </p>
                  {item.nextSteps && <p className="mt-1 text-sm text-slate-500">Next: {item.nextSteps}</p>}
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:shrink-0 sm:items-center">
                  <Select value={item.status} onValueChange={(v) => changeStatus(item, v)}>
                    <SelectTrigger aria-label={`Status for ${item.title}`}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>{s.replaceAll("_", " ")}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button type="button" variant="outline" size="icon" className="min-h-12 min-w-12" aria-label={`Actions for ${item.title}`}>
                        <MoreHorizontal className="size-5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => startEdit(item)}>Edit</DropdownMenuItem>
                      <DropdownMenuItem className="text-red-600" onClick={() => setConfirmItem(item)}>Delete</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
              {item.link && (
                <a href={item.link} target="_blank" rel="noreferrer" className="inline-flex min-h-12 items-center text-base text-brand-600 hover:underline">
                  Join link
                </a>
              )}
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={confirmItem !== null}
        onOpenChange={(o) => !o && setConfirmItem(null)}
        title="Delete meeting?"
        description={confirmItem ? `Delete meeting "${confirmItem.title}"?` : ""}
        confirmLabel="Delete"
        onConfirm={async () => {
          if (confirmItem) await handleDelete(confirmItem);
        }}
      />
      <ErrorDialog
        open={errorDialog !== null}
        onOpenChange={(o) => !o && setErrorDialog(null)}
        title="Could not delete meeting"
        message={errorDialog ?? ""}
        hint="The meeting was not deleted. Check the message above and try again."
      />
    </div>
  );
}

export default function MeetingsPage() {
  return (
    <Suspense fallback={<p className="text-base text-slate-500">Loading meetings…</p>}>
      <MeetingsInner />
    </Suspense>
  );
}
