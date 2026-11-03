"use client";

import { Suspense, useCallback, useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ErrorDialog } from "@/components/ui/responsive-dialog";
import { FieldError, logicalDateErrors, zodFieldErrors } from "@/components/ui/field-error";
import { followUpSchema } from "@/lib/validation";
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

function FollowUpsInner() {
  const searchParams = useSearchParams();
  const presetCompany = searchParams.get("companyId") ?? "";
  const [view, setView] = useState<"today" | "overdue" | "upcoming" | "all">("today");
  const [items, setItems] = useState<FollowUp[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [creating, setCreating] = useState(false);
  const [confirmItem, setConfirmItem] = useState<FollowUp | null>(null);
  const [errorDialog, setErrorDialog] = useState<string | null>(null);
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
      const message = err instanceof Error ? err.message : "Failed to load follow-ups";
      setError(message);
      toast.error(message);
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
    const parsed = followUpSchema.safeParse({
      companyId: form.companyId,
      contactId: form.contactId || null,
      dueDate: form.dueDate,
      reason: form.reason || null,
      notes: form.notes || null,
      status: "PENDING",
      assignedToId: form.assignedToId || null,
    });
    const errs = zodFieldErrors(parsed);
    if (!form.dueDate) errs.dueDate = "Due date is required.";
    const logical = logicalDateErrors({ followUpDate: form.dueDate });
    if (logical.followUpDate) errs.dueDate = logical.followUpDate;
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      return;
    }
    setFieldErrors({});
    setCreating(true);
    try {
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
        const payload = await response.json().catch(() => null);
        const mapped = serverFieldErrors(payload);
        const message = payload?.error ?? payload?.message ?? "Could not create follow-up";
        if (mapped) {
          setFieldErrors(mapped);
          toast.error("Please fix the highlighted fields.");
        } else {
          toast.error(message);
        }
        return;
      }
      setForm({ ...form, contactId: "", dueDate: "", reason: "", notes: "" });
      toast.success("Follow-up created.");
      load();
    } finally {
      setCreating(false);
    }
  }

  async function markDone(item: FollowUp) {
    const response = await fetch(`/api/follow-ups/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "DONE" }),
    });
    if (!response.ok) {
      toast.error(await readError(response, "Could not update follow-up"));
      return;
    }
    toast.success("Follow-up marked done.");
    load();
  }

  async function handleDelete(item: FollowUp) {
    const response = await fetch(`/api/follow-ups/${item.id}`, { method: "DELETE" });
    if (!response.ok) {
      const message = await readError(response, "Could not delete follow-up");
      toast.error(message);
      setErrorDialog(message);
      return;
    }
    toast.success("Follow-up deleted.");
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
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>New follow-up</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="fu-company">Company *</Label>
                <Select value={form.companyId || "__none"} onValueChange={(v) => setForm({ ...form, companyId: v === "__none" ? "" : v, contactId: "" })}>
                  <SelectTrigger id="fu-company"><SelectValue placeholder="Select company…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">Select company…</SelectItem>
                    {companies.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldError message={fieldErrors.companyId} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fu-contact">Contact (optional)</Label>
                <Select value={form.contactId || "__none"} onValueChange={(v) => setForm({ ...form, contactId: v === "__none" ? "" : v })}>
                  <SelectTrigger id="fu-contact"><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">None</SelectItem>
                    {contacts.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.fullName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldError message={fieldErrors.contactId} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fu-due">Due date *</Label>
                <DatePicker className="min-h-12 text-base" value={form.dueDate} onChange={(v) => setForm({ ...form, dueDate: v })} placeholder="Pick a due date" />
                <FieldError message={fieldErrors.dueDate} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fu-reason">Reason</Label>
                <Input id="fu-reason" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="e.g. Second email due" />
                <FieldError message={fieldErrors.reason} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fu-assignee">Assigned to</Label>
                <Select value={form.assignedToId || "__none"} onValueChange={(v) => setForm({ ...form, assignedToId: v === "__none" ? "" : v })}>
                  <SelectTrigger id="fu-assignee"><SelectValue placeholder="Me" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">Me</SelectItem>
                    {assignees.map((a) => (
                      <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldError message={fieldErrors.assignedToId} />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="fu-notes">Notes</Label>
                <Textarea id="fu-notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
                <FieldError message={fieldErrors.notes} />
              </div>
            </div>
            <Button type="submit" disabled={creating} className="w-full sm:w-auto">{creating ? "Creating…" : "Create follow-up"}</Button>
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
            action={
              <Button type="button" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
                Create a follow-up
              </Button>
            }
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
                    <Button type="button" variant="ghost" className="text-red-600 hover:text-red-700" onClick={() => setConfirmItem(item)}>
                      Delete
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={confirmItem !== null}
        onOpenChange={(o) => !o && setConfirmItem(null)}
        title="Delete follow-up?"
        description={confirmItem ? `Delete this follow-up for ${confirmItem.company.name}?` : ""}
        confirmLabel="Delete"
        onConfirm={async () => {
          if (confirmItem) await handleDelete(confirmItem);
        }}
      />
      <ErrorDialog
        open={errorDialog !== null}
        onOpenChange={(o) => !o && setErrorDialog(null)}
        title="Could not delete follow-up"
        message={errorDialog ?? ""}
        hint="The follow-up was not deleted. Check the message above and try again."
      />
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
