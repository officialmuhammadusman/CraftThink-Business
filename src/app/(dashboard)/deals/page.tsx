"use client";

import { Suspense, useCallback, useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
};
type Company = { id: string; name: string };
type Contact = { id: string; fullName: string };
type Assignee = { id: string; name: string; role: string };

const inputCls =
  "flex min-h-12 w-full rounded-md border border-slate-300 bg-white px-3 py-3 text-base text-slate-900";
const selectCls =
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
  return payload?.error ?? fallback;
}

function DealsInner() {
  const searchParams = useSearchParams();
  const presetCompany = searchParams.get("companyId") ?? "";
  const [view, setView] = useState<"board" | "list">("board");
  const [items, setItems] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
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
      setError(err instanceof Error ? err.message : "Failed to load deals");
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
    setNotice(null);
    if (!form.companyId || !form.title) {
      setNotice("Company and title are required.");
      return;
    }
    if (form.status === "LOST" && !form.notes.trim()) {
      setNotice("A lost deal requires a reason note.");
      return;
    }
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
      setNotice(await readError(response, "Could not create deal"));
      return;
    }
    setNotice("Deal created.");
    setForm({ ...form, contactId: "", title: "", services: "", estimatedBudget: "", finalPrice: "", notes: "" });
    load();
  }

  function requestMove(deal: Deal, stage: string) {
    if (stage === deal.status) return;
    setMove({ deal, stage, lostReason: "" });
  }

  async function confirmMove() {
    if (!move) return;
    if (move.stage === "LOST" && !move.lostReason.trim() && !(move.deal.notes ?? "").trim()) {
      setNotice("A lost deal requires a reason note — type one in the dialog.");
      return;
    }
    const response = await fetch(`/api/deals/${move.deal.id}/move`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: move.stage,
        notes: move.stage === "LOST" && move.lostReason.trim() ? move.lostReason : undefined,
      }),
    });
    if (!response.ok) {
      setNotice(await readError(response, "Could not move deal"));
      setMove(null);
      return;
    }
    const payload = await response.json();
    const updated = payload.data as Deal;
    setNotice(`Deal moved to ${move.stage.replaceAll("_", " ")}.`);
    setMove(null);
    load();
    if (updated.status === "WON") {
      setConvert({ deal: updated, name: updated.title, managerId: "" });
    }
  }

  async function confirmConvert() {
    if (!convert) return;
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
        setNotice("This deal already has a project — no duplicate was created.");
      } else {
        setNotice(payload?.error ?? "Could not create project");
      }
      setConvert(null);
      return;
    }
    setNotice("Project created from this deal. It was NOT created automatically — you confirmed it here.");
    setConvert(null);
    load();
  }

  async function handleDelete(deal: Deal) {
    if (!window.confirm(`Delete deal "${deal.title}"?`)) return;
    const response = await fetch(`/api/deals/${deal.id}`, { method: "DELETE" });
    if (!response.ok) {
      setNotice(await readError(response, "Could not delete deal"));
      return;
    }
    load();
  }

  const canConvert = meRole === "SUPER_ADMIN" || meRole === "ADMIN" || meRole === "PROJECT_MANAGER";

  function dealCard(deal: Deal) {
    return (
      <Card key={deal.id}>
        <CardContent className="space-y-2 p-4">
        <p className="text-base font-medium text-slate-900">{deal.title}</p>
        <p className="flex flex-wrap items-center gap-2">
          <Badge variant={stageBadgeVariant(deal.status)}>{deal.status.replaceAll("_", " ")}</Badge>
        </p>
        <p className="text-base text-slate-500">
          {deal.company.name}
          {deal.contact ? ` · ${deal.contact.fullName}` : ""}
        </p>
        <p className="text-base text-slate-500">
          {deal.currency}{" "}
          {deal.finalPrice ?? deal.estimatedBudget ?? "—"}
          {deal.assignedTo ? ` · ${deal.assignedTo.name}` : ""}
        </p>
        {deal.services.length > 0 && (
          <p className="text-sm text-slate-500">{deal.services.join(", ")}</p>
        )}
        <div className="space-y-2 pt-1">
          <Label htmlFor={`move-${deal.id}`}>Move to</Label>
          <select
            id={`move-${deal.id}`}
            value={deal.status}
            onChange={(e) => requestMove(deal, e.target.value)}
            className={selectCls}
          >
            {STAGES.map((s) => (
              <option key={s} value={s}>{s.replaceAll("_", " ")}</option>
            ))}
          </select>
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
        <Button type="button" variant="ghost" className="w-full text-red-600 hover:text-red-700" onClick={() => handleDelete(deal)}>
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
      {notice && <p className="mt-4 rounded-md bg-slate-100 px-3 py-3 text-base text-slate-700">{notice}</p>}

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>New deal</CardTitle>
        </CardHeader>
        <CardContent>
        <form onSubmit={handleCreate} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="block space-y-2 text-base font-medium text-slate-700">
            Company *
            <select required value={form.companyId} onChange={(e) => setForm({ ...form, companyId: e.target.value, contactId: "" })} className={inputCls}>
              <option value="">Select company…</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
          <label className="block space-y-2 text-base font-medium text-slate-700">
            Contact (optional)
            <select value={form.contactId} onChange={(e) => setForm({ ...form, contactId: e.target.value })} className={inputCls}>
              <option value="">None</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>{c.fullName}</option>
              ))}
            </select>
          </label>
          <label className="block space-y-2 text-base font-medium text-slate-700">
            Title *
            <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={inputCls} />
          </label>
          <label className="block space-y-2 text-base font-medium text-slate-700">
            Services (comma-separated)
            <input value={form.services} onChange={(e) => setForm({ ...form, services: e.target.value })} className={inputCls} />
          </label>
          <label className="block space-y-2 text-base font-medium text-slate-700">
            Estimated budget
            <input type="number" min="0" step="0.01" value={form.estimatedBudget} onChange={(e) => setForm({ ...form, estimatedBudget: e.target.value })} className={inputCls} />
          </label>
          <label className="block space-y-2 text-base font-medium text-slate-700">
            Currency
            <input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} className={inputCls} />
          </label>
          <label className="block space-y-2 text-base font-medium text-slate-700">
            Expected close date
            <input type="date" value={form.expectedCloseDate} onChange={(e) => setForm({ ...form, expectedCloseDate: e.target.value })} className={inputCls} />
          </label>
          <label className="block space-y-2 text-base font-medium text-slate-700">
            Stage
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className={inputCls}>
              {STAGES.map((s) => (
                <option key={s} value={s}>{s.replaceAll("_", " ")}</option>
              ))}
            </select>
          </label>
          <label className="block space-y-2 text-base font-medium text-slate-700">
            Final price
            <input type="number" min="0" step="0.01" value={form.finalPrice} onChange={(e) => setForm({ ...form, finalPrice: e.target.value })} className={inputCls} />
          </label>
          <label className="block space-y-2 text-base font-medium text-slate-700">
            Assigned to
            <select value={form.assignedToId} onChange={(e) => setForm({ ...form, assignedToId: e.target.value })} className={inputCls}>
              <option value="">Me</option>
              {assignees.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </label>
          <label className="block space-y-2 text-base font-medium text-slate-700 sm:col-span-2">
            Notes {form.status === "LOST" ? "(reason required for Lost)" : ""}
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} className={inputCls} />
          </label>
        </div>
        <Button type="submit" className="w-full sm:w-auto">Create deal</Button>
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
          />
        </div>
      ) : view === "board" ? (
        <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:gap-3 lg:overflow-x-auto lg:pb-2">
          {STAGES.map((stage) => {
            const stageDeals = items.filter((d) => d.status === stage);
            return (
              <section key={stage} className="w-full shrink-0 rounded-xl border border-slate-200 bg-slate-50 p-3 lg:w-72">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
                  {stage.replaceAll("_", " ")} ({stageDeals.length})
                </h2>
                <div className="mt-3 space-y-3">
                  {stageDeals.length === 0 ? (
                    <p className="text-sm text-slate-400">Empty</p>
                  ) : (
                    stageDeals.map(dealCard)
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

      <Dialog open={move !== null} onOpenChange={(open) => { if (!open) setMove(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move deal?</DialogTitle>
            {move && (
              <DialogDescription>
                Move “{move.deal.title}” from {move.deal.status.replaceAll("_", " ")} to{" "}
                {move.stage.replaceAll("_", " ")}? This change is logged.
              </DialogDescription>
            )}
          </DialogHeader>
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
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="button" onClick={confirmMove}>
              Confirm move
            </Button>
            <Button type="button" variant="outline" onClick={() => setMove(null)}>
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={convert !== null} onOpenChange={(open) => { if (!open) setConvert(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create project from this deal?</DialogTitle>
            {convert && (
              <DialogDescription>
                “{convert.deal.title}” is WON. Nothing has been created yet — this
                step only runs when you confirm here. Budget will be the deal’s
                final price{convert.deal.finalPrice == null && convert.deal.estimatedBudget != null ? " (falling back to estimated budget)" : ""}.
              </DialogDescription>
            )}
          </DialogHeader>
          {convert && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="convert-name">Project name</Label>
                <Input id="convert-name" value={convert.name} onChange={(e) => setConvert({ ...convert, name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="convert-manager">Project manager</Label>
                <select id="convert-manager" value={convert.managerId} onChange={(e) => setConvert({ ...convert, managerId: e.target.value })} className={selectCls}>
                  <option value="">Deal assignee / none</option>
                  {assignees.map((a) => (
                    <option key={a.id} value={a.id}>{a.name} ({a.role.replaceAll("_", " ")})</option>
                  ))}
                </select>
              </div>
            </div>
          )}
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="button" onClick={confirmConvert}>
              Yes, create project
            </Button>
            <Button type="button" variant="outline" onClick={() => setConvert(null)}>
              Not yet
            </Button>
          </div>
        </DialogContent>
      </Dialog>
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
