"use client";

import { Suspense, useCallback, useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
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
import { ResponsiveDialog, ErrorDialog } from "@/components/ui/responsive-dialog";
import { FieldError, zodFieldErrors } from "@/components/ui/field-error";
import { dealSchema } from "@/lib/validation";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";

const STAGES = [
  "NEW_LEAD",
  "CONTACTED",
  "FOLLOW_UP",
  "INTERESTED",
  "MEETING_SCHEDULED",
  "MEETING_COMPLETED",
  "PROPOSAL_SENT",
  "NEGOTIATION",
  "WON",
  "LOST",
];

type Deal = {
  id: string;
  title: string;
  services: string[];
  estimatedBudget: number | null;
  finalPrice: number | null;
  currency: string;
  expectedCloseDate: string | null;
  status: string;
  notes: string | null;
  company: { id: string; name: string };
  contact: { id: string; fullName: string } | null;
  assignedTo: { id: string; name: string } | null;
  projects: { id: string; name: string; status: string }[];
  createdAt?: string;
  updatedAt?: string;
};

/**
 * Rotting rule: an open deal (not WON/LOST) is stale when its expected close
 * date has passed, or when it has not been updated in 30+ days (updatedAt
 * from the API, falling back to createdAt). Never invents an activity date.
 */
function staleReason(deal: Deal): string | null {
  if (deal.status === "WON" || deal.status === "LOST") return null;
  if (deal.expectedCloseDate) {
    const close = new Date(deal.expectedCloseDate);
    close.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (close < today) return "Close date passed";
  }
  const ref = deal.updatedAt ?? deal.createdAt;
  if (ref) {
    const days = (Date.now() - new Date(ref).getTime()) / 86400000;
    if (days >= 30) return "No update in 30+ days";
  }
  return null;
}
type Company = { id: string; name: string };
type Contact = { id: string; fullName: string };
type Assignee = { id: string; name: string; role: string };

const inputCls =
  "flex min-h-12 w-full rounded-md border border-slate-300 bg-white px-3 py-3 text-base text-slate-900";

function stageBadgeVariant(stage: string): "success" | "destructive" | "warning" | "info" | "secondary" {
  if (stage === "WON") return "success";
  if (stage === "LOST") return "destructive";
  if (stage === "INTERESTED" || stage === "PROPOSAL_SENT" || stage === "NEGOTIATION") return "info";
  if (stage === "FOLLOW_UP" || stage === "MEETING_SCHEDULED" || stage === "MEETING_COMPLETED") return "warning";
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

function DealsInner() {
  const searchParams = useSearchParams();
  const presetCompany = searchParams.get("companyId") ?? "";
  const [view, setView] = useState<"board" | "list">("board");
  const [items, setItems] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [confirmDeal, setConfirmDeal] = useState<Deal | null>(null);
  const [errorDialog, setErrorDialog] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);
  const [converting, setConverting] = useState(false);
  const [dragged, setDragged] = useState<Deal | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [meRole, setMeRole] = useState("");
  const [form, setForm] = useState({
    companyId: presetCompany,
    contactId: "",
    title: "",
    services: "",
    estimatedBudget: "",
    currency: "USD",
    expectedCloseDate: "",
    status: "NEW_LEAD",
    finalPrice: "",
    notes: "",
    assignedToId: "",
  });
  // Move dialog: { deal, stage, lostReason }
  const [move, setMove] = useState<{ deal: Deal; stage: string; lostReason: string } | null>(null);
  // Won → project confirmation dialog.
  const [convert, setConvert] = useState<{ deal: Deal; name: string; managerId: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/deals?limit=100");
      if (!response.ok) throw new Error(await readError(response, "Failed to load deals"));
      const payload = await response.json();
      setItems(payload.data.items as Deal[]);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load deals";
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, []);

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
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((p) => setMeRole(p.data?.role ?? p.role ?? ""))
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
    const parsed = dealSchema.safeParse({
      companyId: form.companyId,
      contactId: form.contactId || null,
      title: form.title,
      services: form.services.split(",").map((s) => s.trim()).filter(Boolean),
      estimatedBudget: form.estimatedBudget ? Number(form.estimatedBudget) : null,
      currency: form.currency || "USD",
      expectedCloseDate: form.expectedCloseDate || null,
      status: form.status,
      finalPrice: form.finalPrice ? Number(form.finalPrice) : null,
      notes: form.notes || null,
      assignedToId: form.assignedToId || null,
    });
    const errs = zodFieldErrors(parsed);
    if (form.status === "LOST" && !form.notes.trim()) {
      errs.notes = "A lost deal requires a reason note.";
    }
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      return;
    }
    setFieldErrors({});
    setSubmitting(true);
    try {
      const response = await fetch("/api/deals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: form.companyId,
          contactId: form.contactId || null,
          title: form.title,
          services: form.services.split(",").map((s) => s.trim()).filter(Boolean),
          estimatedBudget: form.estimatedBudget ? Number(form.estimatedBudget) : null,
          currency: form.currency || "USD",
          expectedCloseDate: form.expectedCloseDate ? new Date(form.expectedCloseDate).toISOString() : null,
          status: form.status,
          finalPrice: form.finalPrice ? Number(form.finalPrice) : null,
          notes: form.notes || null,
          assignedToId: form.assignedToId || null,
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        const mapped = serverFieldErrors(payload);
        const message = payload?.error ?? payload?.message ?? "Could not create deal";
        if (mapped) {
          setFieldErrors(mapped);
          toast.error("Please fix the highlighted fields.");
        } else {
          toast.error(message);
        }
        return;
      }
      toast.success("Deal created.");
      setForm({ ...form, contactId: "", title: "", services: "", estimatedBudget: "", finalPrice: "", notes: "" });
      load();
    } finally {
      setSubmitting(false);
    }
  }

  function requestMove(deal: Deal, stage: string) {
    if (stage === deal.status) return;
    setMove({ deal, stage, lostReason: "" });
  }

  async function confirmMove() {
    if (!move) return;
    if (move.stage === "LOST" && !move.lostReason.trim() && !(move.deal.notes ?? "").trim()) {
      toast.error("A lost deal requires a reason note — type one in the dialog.");
      return;
    }
    setMoving(true);
    try {
      const response = await fetch(`/api/deals/${move.deal.id}/move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: move.stage,
          notes: move.stage === "LOST" && move.lostReason.trim() ? move.lostReason : undefined,
        }),
      });
      if (!response.ok) {
        const message = await readError(response, "Could not move deal");
        toast.error(message);
        setErrorDialog(message);
        setMove(null);
        return;
      }
      const payload = await response.json();
      const updated = payload.data as Deal;
      toast.success(`Deal moved to ${move.stage.replaceAll("_", " ")}.`);
      setMove(null);
      load();
      if (updated.status === "WON") {
        setConvert({ deal: updated, name: updated.title, managerId: "" });
      }
    } finally {
      setMoving(false);
    }
  }

  async function confirmConvert() {
    if (!convert) return;
    setConverting(true);
    try {
      const response = await fetch(`/api/deals/${convert.deal.id}/create-project`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: convert.name || convert.deal.title,
          managerId: convert.managerId || null,
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        if (response.status === 409 && payload?.data) {
          toast.error("This deal already has a project — no duplicate was created.");
        } else {
          const message = payload?.error ?? "Could not create project";
          toast.error(message);
          setErrorDialog(message);
        }
        setConvert(null);
        return;
      }
      toast.success("Project created from this deal. It was NOT created automatically — you confirmed it here.");
      setConvert(null);
      load();
    } finally {
      setConverting(false);
    }
  }

  async function handleDelete(deal: Deal) {
    const response = await fetch(`/api/deals/${deal.id}`, { method: "DELETE" });
    if (!response.ok) {
      const message = await readError(response, "Could not delete deal");
      toast.error(message);
      setErrorDialog(message);
      return;
    }
    toast.success("Deal deleted.");
    load();
  }

  const canConvert = meRole === "SUPER_ADMIN" || meRole === "ADMIN" || meRole === "PROJECT_MANAGER";

  function dealCard(deal: Deal) {
    const stale = staleReason(deal);
    return (
      <Card key={deal.id}>
        <CardContent className="space-y-2 p-4">
        <p className="text-base font-medium text-slate-900">{deal.title}</p>
        <p className="flex flex-wrap items-center gap-2">
          <Badge variant={stageBadgeVariant(deal.status)}>{deal.status.replaceAll("_", " ")}</Badge>
          {stale ? <Badge variant="destructive">Stale · {stale}</Badge> : null}
        </p>
        <p className="text-base text-slate-500">
          {deal.company.name}
          {deal.contact ? ` · ${deal.contact.fullName}` : ""}
        </p>
        <p className="text-base text-slate-500">
          Value: {deal.currency}{" "}
          {deal.finalPrice ?? deal.estimatedBudget ?? "—"}
        </p>
        <p className="text-base text-slate-500">
          Close: {deal.expectedCloseDate ? new Date(deal.expectedCloseDate).toLocaleDateString() : "No close date"}
        </p>
        <p className="text-base text-slate-500">
          Owner: {deal.assignedTo ? deal.assignedTo.name : "Unassigned"}
        </p>
        {deal.services.length > 0 && (
          <p className="text-sm text-slate-500">{deal.services.join(", ")}</p>
        )}
        <div className="space-y-2 pt-1">
          <Label htmlFor={`move-${deal.id}`}>Move to</Label>
          <Select value={deal.status} onValueChange={(v) => requestMove(deal, v)}>
            <SelectTrigger id={`move-${deal.id}`}><SelectValue /></SelectTrigger>
            <SelectContent>
              {STAGES.map((s) => (
                <SelectItem key={s} value={s}>{s.replaceAll("_", " ")}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {deal.status === "WON" && (
          <div className="pt-1">
            {deal.projects.length > 0 ? (
              <p className="text-sm text-slate-500">
                Project: {deal.projects[0].name} ({deal.projects[0].status})
              </p>
            ) : canConvert ? (
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => setConvert({ deal, name: deal.title, managerId: "" })}
              >
                Create project from this deal?
              </Button>
            ) : (
              <p className="text-sm text-slate-500">
                Won — ask a Project Manager or Admin to create the project.
              </p>
            )}
          </div>
        )}
        <Button type="button" variant="ghost" className="w-full text-red-600 hover:text-red-700" onClick={() => setConfirmDeal(deal)}>
          Delete
        </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div>
      <PageHeader
        title="Deals"
        subtitle="One 10-stage pipeline. Stage changes are logged. A WON deal never becomes a project on its own — you confirm that step explicitly."
        action={
          <Button variant="outline" asChild>
            <Link href="/activity-log">View activity log</Link>
          </Button>
        }
      />
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>New deal</CardTitle>
        </CardHeader>
        <CardContent>
        <form onSubmit={handleCreate} className="space-y-4">
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
            Services (comma-separated)
            <input value={form.services} onChange={(e) => setForm({ ...form, services: e.target.value })} className={inputCls} />
            <FieldError message={fieldErrors.services} />
          </label>
          <label className="block space-y-2 text-base font-medium text-slate-700">
            Estimated budget
            <input type="number" min="0" step="0.01" value={form.estimatedBudget} onChange={(e) => setForm({ ...form, estimatedBudget: e.target.value })} className={inputCls} />
            <FieldError message={fieldErrors.estimatedBudget} />
          </label>
          <label className="block space-y-2 text-base font-medium text-slate-700">
            Currency
            <input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} className={inputCls} />
            <FieldError message={fieldErrors.currency} />
          </label>
          <label className="block space-y-2 text-base font-medium text-slate-700">
            Expected close date
            <DatePicker className="min-h-12 text-base" value={form.expectedCloseDate} onChange={(v) => setForm({ ...form, expectedCloseDate: v })} placeholder="Pick a close date" />
            <FieldError message={fieldErrors.expectedCloseDate} />
          </label>
          <label className="block space-y-2 text-base font-medium text-slate-700">
            Stage
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STAGES.map((s) => (
                  <SelectItem key={s} value={s}>{s.replaceAll("_", " ")}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldError message={fieldErrors.status} />
          </label>
          <label className="block space-y-2 text-base font-medium text-slate-700">
            Final price
            <input type="number" min="0" step="0.01" value={form.finalPrice} onChange={(e) => setForm({ ...form, finalPrice: e.target.value })} className={inputCls} />
            <FieldError message={fieldErrors.finalPrice} />
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
          <label className="block space-y-2 text-base font-medium text-slate-700 sm:col-span-2">
            Notes {form.status === "LOST" ? "(reason required for Lost)" : ""}
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} className={inputCls} />
            <FieldError message={fieldErrors.notes} />
          </label>
        </div>
        <Button type="submit" disabled={submitting} className="w-full sm:w-auto">{submitting ? "Creating…" : "Create deal"}</Button>
        </form>
        </CardContent>
      </Card>

      <div className="mt-6 flex flex-wrap gap-2" role="group" aria-label="Deals view">
        <Button type="button" onClick={() => setView("board")} aria-pressed={view === "board"} variant={view === "board" ? "default" : "outline"}>
          Board
        </Button>
        <Button type="button" onClick={() => setView("list")} aria-pressed={view === "list"} variant={view === "list" ? "default" : "outline"}>
          List
        </Button>
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded-md bg-red-50 px-3 py-3 text-base text-red-700">{error}</p>
      )}
      {loading ? (
        <div className="mt-4 space-y-3" aria-label="Loading deals">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
      ) : items.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            image="/images/empty-deals.svg"
            title="No deals yet"
            description="Create one above to start the pipeline."
            action={
              <Button type="button" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
                Create a deal
              </Button>
            }
          />
        </div>
      ) : view === "board" ? (
        <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:gap-3 lg:overflow-x-auto lg:pb-2">
          {STAGES.map((stage) => {
            const stageDeals = items.filter((d) => d.status === stage);
            return (
              <section
                key={stage}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  setDragOverStage(stage);
                }}
                onDragLeave={() => setDragOverStage((s) => (s === stage ? null : s))}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOverStage(null);
                  if (dragged && dragged.status !== stage) requestMove(dragged, stage);
                  setDragged(null);
                }}
                className={`w-full shrink-0 rounded-xl border border-slate-200 bg-slate-50 p-3 lg:w-72 ${
                  dragOverStage === stage ? "ring-2 ring-brand-600" : ""
                }`}
              >
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
                  {stage.replaceAll("_", " ")} ({stageDeals.length})
                </h2>
                <div className="mt-3 space-y-3">
                  {stageDeals.length === 0 ? (
                    <p className="text-sm text-slate-400">Empty — drop a deal here to move it</p>
                  ) : (
                    stageDeals.map((deal) => (
                      <div
                        key={deal.id}
                        draggable
                        onDragStart={(e) => {
                          setDragged(deal);
                          e.dataTransfer.effectAllowed = "move";
                        }}
                        onDragEnd={() => setDragged(null)}
                      >
                        {dealCard(deal)}
                      </div>
                    ))
                  )}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {items.map(dealCard)}
        </div>
      )}

      <ResponsiveDialog
        open={move !== null}
        onOpenChange={(open) => { if (!open) setMove(null); }}
        title="Move deal?"
        description={
          move
            ? `Move “${move.deal.title}” from ${move.deal.status.replaceAll("_", " ")} to ${move.stage.replaceAll("_", " ")}? This change is logged.`
            : undefined
        }
        footer={
          <>
            <Button type="button" disabled={moving} onClick={confirmMove}>
              {moving ? "Moving…" : "Confirm move"}
            </Button>
            <Button type="button" variant="outline" onClick={() => setMove(null)}>
              Cancel
            </Button>
          </>
        }
      >
        {move?.stage === "LOST" && move && (
          <div className="space-y-2">
            <Label htmlFor="lost-reason">Reason for losing (required)</Label>
            <Textarea
              id="lost-reason"
              required
              value={move.lostReason}
              onChange={(e) => setMove({ ...move, lostReason: e.target.value })}
              rows={3}
            />
          </div>
        )}
      </ResponsiveDialog>

      <ResponsiveDialog
        open={convert !== null}
        onOpenChange={(open) => { if (!open) setConvert(null); }}
        title="Create project from this deal?"
        description={
          convert
            ? `“${convert.deal.title}” is WON. Nothing has been created yet — this step only runs when you confirm here. Budget will be the deal’s final price${convert.deal.finalPrice == null && convert.deal.estimatedBudget != null ? " (falling back to estimated budget)" : ""}.`
            : undefined
        }
        footer={
          <>
            <Button type="button" disabled={converting} onClick={confirmConvert}>
              {converting ? "Creating…" : "Yes, create project"}
            </Button>
            <Button type="button" variant="outline" onClick={() => setConvert(null)}>
              Not yet
            </Button>
          </>
        }
      >
        {convert && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="convert-name">Project name</Label>
              <Input id="convert-name" value={convert.name} onChange={(e) => setConvert({ ...convert, name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="convert-manager">Project manager</Label>
              <Select value={convert.managerId || "__none"} onValueChange={(v) => setConvert({ ...convert, managerId: v === "__none" ? "" : v })}>
                <SelectTrigger id="convert-manager"><SelectValue placeholder="Deal assignee / none" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Deal assignee / none</SelectItem>
                  {assignees.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name} ({a.role.replaceAll("_", " ")})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </ResponsiveDialog>

      <ConfirmDialog
        open={confirmDeal !== null}
        onOpenChange={(o) => !o && setConfirmDeal(null)}
        title="Delete deal?"
        description={confirmDeal ? `Delete deal "${confirmDeal.title}"?` : ""}
        confirmLabel="Delete"
        onConfirm={async () => {
          if (confirmDeal) await handleDelete(confirmDeal);
        }}
      />
      <ErrorDialog
        open={errorDialog !== null}
        onOpenChange={(o) => !o && setErrorDialog(null)}
        title="Action failed"
        message={errorDialog ?? ""}
        hint="Nothing was changed by the failed step. Check the message above and try again."
      />
    </div>
  );
}

export default function DealsPage() {
  return (
    <Suspense fallback={<p className="text-base text-slate-500">Loading deals…</p>}>
      <DealsInner />
    </Suspense>
  );
}
