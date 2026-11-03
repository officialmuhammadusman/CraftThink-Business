"use client";

import { Suspense, useCallback, useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

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
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900";
const btnPrimary =
  "rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50";
const btnSecondary =
  "rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50";

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
      <article key={deal.id} className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
        <p className="text-sm font-medium text-slate-900">{deal.title}</p>
        <p className="mt-1 text-xs text-slate-500">
          {deal.company.name}
          {deal.contact ? ` · ${deal.contact.fullName}` : ""}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          {deal.currency}{" "}
          {deal.finalPrice ?? deal.estimatedBudget ?? "—"}
          {deal.assignedTo ? ` · ${deal.assignedTo.name}` : ""}
        </p>
        {deal.services.length > 0 && (
          <p className="mt-1 text-xs text-slate-500">{deal.services.join(", ")}</p>
        )}
        <label className="mt-2 block text-xs text-slate-500">
          Move to
          <select
            value={deal.status}
            onChange={(e) => requestMove(deal, e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900"
          >
            {STAGES.map((s) => (
              <option key={s} value={s}>{s.replaceAll("_", " ")}</option>
            ))}
          </select>
        </label>
        {deal.status === "WON" && (
          <div className="mt-2">
            {deal.projects.length > 0 ? (
              <p className="text-xs text-slate-500">
                Project: {deal.projects[0].name} ({deal.projects[0].status})
              </p>
            ) : canConvert ? (
              <button
                type="button"
                onClick={() => setConvert({ deal, name: deal.title, managerId: "" })}
                className={btnSecondary}
              >
                Create project from this deal?
              </button>
            ) : (
              <p className="text-xs text-slate-500">
                Won — ask a Project Manager or Admin to create the project.
              </p>
            )}
          </div>
        )}
        <button type="button" onClick={() => handleDelete(deal)} className="mt-2 text-xs font-medium text-red-600 hover:underline">
          Delete
        </button>
      </article>
    );
  }

  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900">Deals</h1>
      <p className="mt-1 text-sm text-slate-500">
        One 10-stage pipeline. Stage changes are logged. A WON deal never becomes
        a project on its own — you confirm that step explicitly.
      </p>
      <p className="mt-2 text-sm text-slate-500">
        <Link href="/activity-log" className="text-brand-600 hover:underline">
          View activity log
        </Link>
      </p>
      {notice && <p className="mt-3 rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-700">{notice}</p>}

      <form onSubmit={handleCreate} className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">New deal</h2>
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
            Title *
            <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={`${inputCls} mt-1 font-normal`} />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Services (comma-separated)
            <input value={form.services} onChange={(e) => setForm({ ...form, services: e.target.value })} className={`${inputCls} mt-1 font-normal`} />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Estimated budget
            <input type="number" min="0" step="0.01" value={form.estimatedBudget} onChange={(e) => setForm({ ...form, estimatedBudget: e.target.value })} className={`${inputCls} mt-1 font-normal`} />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Currency
            <input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} className={`${inputCls} mt-1 font-normal`} />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Expected close date
            <input type="date" value={form.expectedCloseDate} onChange={(e) => setForm({ ...form, expectedCloseDate: e.target.value })} className={`${inputCls} mt-1 font-normal`} />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Stage
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className={`${inputCls} mt-1 font-normal`}>
              {STAGES.map((s) => (
                <option key={s} value={s}>{s.replaceAll("_", " ")}</option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">
            Final price
            <input type="number" min="0" step="0.01" value={form.finalPrice} onChange={(e) => setForm({ ...form, finalPrice: e.target.value })} className={`${inputCls} mt-1 font-normal`} />
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
            Notes {form.status === "LOST" ? "(reason required for Lost)" : ""}
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} className={`${inputCls} mt-1 font-normal`} />
          </label>
        </div>
        <button type="submit" className={`${btnPrimary} mt-4`}>Create deal</button>
      </form>

      <div className="mt-4 flex gap-2">
        <button type="button" onClick={() => setView("board")} aria-pressed={view === "board"} className={view === "board" ? btnPrimary : btnSecondary}>
          Board
        </button>
        <button type="button" onClick={() => setView("list")} aria-pressed={view === "list"} className={view === "list" ? btnPrimary : btnSecondary}>
          List
        </button>
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}
      {loading ? (
        <p className="mt-4 text-sm text-slate-500">Loading deals…</p>
      ) : items.length === 0 ? (
        <p className="mt-4 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
          No deals yet. Create one above.
        </p>
      ) : view === "board" ? (
        <div className="mt-4 flex gap-3 overflow-x-auto pb-2">
          {STAGES.map((stage) => {
            const stageDeals = items.filter((d) => d.status === stage);
            return (
              <section key={stage} className="w-64 shrink-0 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                  {stage.replaceAll("_", " ")} ({stageDeals.length})
                </h2>
                <div className="mt-2 space-y-2">
                  {stageDeals.length === 0 ? (
                    <p className="text-xs text-slate-400">Empty</p>
                  ) : (
                    stageDeals.map(dealCard)
                  )}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          {items.map(dealCard)}
        </div>
      )}

      {move && (
        <div role="dialog" aria-modal="true" aria-label="Confirm stage change" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-lg">
            <h2 className="text-base font-semibold text-slate-900">Move deal?</h2>
            <p className="mt-2 text-sm text-slate-600">
              Move “{move.deal.title}” from {move.deal.status.replaceAll("_", " ")} to{" "}
              {move.stage.replaceAll("_", " ")}? This change is logged.
            </p>
            {move.stage === "LOST" && (
              <label className="mt-3 block text-sm font-medium text-slate-700">
                Reason for losing (required)
                <textarea
                  required
                  value={move.lostReason}
                  onChange={(e) => setMove({ ...move, lostReason: e.target.value })}
                  rows={3}
                  className={`${inputCls} mt-1 font-normal`}
                />
              </label>
            )}
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={confirmMove} className={btnPrimary}>
                Confirm move
              </button>
              <button type="button" onClick={() => setMove(null)} className={btnSecondary}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {convert && (
        <div role="dialog" aria-modal="true" aria-label="Create project from deal" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-lg">
            <h2 className="text-base font-semibold text-slate-900">Create project from this deal?</h2>
            <p className="mt-2 text-sm text-slate-600">
              “{convert.deal.title}” is WON. Nothing has been created yet — this
              step only runs when you confirm here. Budget will be the deal’s
              final price{convert.deal.finalPrice == null && convert.deal.estimatedBudget != null ? " (falling back to estimated budget)" : ""}.
            </p>
            <label className="mt-3 block text-sm font-medium text-slate-700">
              Project name
              <input value={convert.name} onChange={(e) => setConvert({ ...convert, name: e.target.value })} className={`${inputCls} mt-1 font-normal`} />
            </label>
            <label className="mt-3 block text-sm font-medium text-slate-700">
              Project manager
              <select value={convert.managerId} onChange={(e) => setConvert({ ...convert, managerId: e.target.value })} className={`${inputCls} mt-1 font-normal`}>
                <option value="">Deal assignee / none</option>
                {assignees.map((a) => (
                  <option key={a.id} value={a.id}>{a.name} ({a.role.replaceAll("_", " ")})</option>
                ))}
              </select>
            </label>
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={confirmConvert} className={btnPrimary}>
                Yes, create project
              </button>
              <button type="button" onClick={() => setConvert(null)} className={btnSecondary}>
                Not yet
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function DealsPage() {
  return (
    <Suspense fallback={<p className="text-sm text-slate-500">Loading deals…</p>}>
      <DealsInner />
    </Suspense>
  );
}
