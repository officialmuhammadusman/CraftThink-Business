"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";

type Project = {
  id: string;
  name: string;
  description: string | null;
  budget: number | null;
  startDate: string | null;
  deadline: string | null;
  status: string;
  techStack: string[];
  requirements: string | null;
  internalNotes: string | null;
  company: { id: string; name: string };
  manager: { id: string; name: string } | null;
  developers: { id: string; name: string }[];
  deal: { id: string; title: string } | null;
  _count: { tasks: number };
};
type Company = { id: string; name: string };
type Assignee = { id: string; name: string; role: string };

const STATUSES = [
  "PLANNING",
  "IN_PROGRESS",
  "REVIEW",
  "TESTING",
  "COMPLETED",
  "ON_HOLD",
  "CANCELLED",
];

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

const emptyForm = {
  companyId: "",
  name: "",
  description: "",
  budget: "",
  startDate: "",
  deadline: "",
  managerId: "",
  developerIds: [] as string[],
  status: "PLANNING",
  techStack: "",
  requirements: "",
  internalNotes: "",
};

export default function ProjectsPage() {
  const [statusFilter, setStatusFilter] = useState("");
  const [items, setItems] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [meRole, setMeRole] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: "100" });
      if (statusFilter) params.set("status", statusFilter);
      const response = await fetch(`/api/projects?${params}`);
      if (!response.ok) throw new Error(await readError(response, "Failed to load projects"));
      const payload = await response.json();
      setItems(payload.data.items as Project[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load projects");
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
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((p) => setMeRole(p.data?.user?.role ?? ""))
      .catch(() => undefined);
  }, []);

  const canCreate =
    meRole === "SUPER_ADMIN" || meRole === "ADMIN" || meRole === "PROJECT_MANAGER";
  const canDelete = meRole === "SUPER_ADMIN" || meRole === "ADMIN";

  function toggleDeveloper(id: string) {
    setForm((f) => ({
      ...f,
      developerIds: f.developerIds.includes(id)
        ? f.developerIds.filter((d) => d !== id)
        : [...f.developerIds, id],
    }));
  }

  function startEdit(item: Project) {
    setEditingId(item.id);
    setForm({
      companyId: item.company.id,
      name: item.name,
      description: item.description ?? "",
      budget: item.budget != null ? String(item.budget) : "",
      startDate: item.startDate ? item.startDate.slice(0, 10) : "",
      deadline: item.deadline ? item.deadline.slice(0, 10) : "",
      managerId: item.manager?.id ?? "",
      developerIds: item.developers.map((d) => d.id),
      status: item.status,
      techStack: item.techStack.join(", "),
      requirements: item.requirements ?? "",
      internalNotes: item.internalNotes ?? "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function resetForm() {
    setEditingId(null);
    setForm(emptyForm);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setNotice(null);
    if (!form.companyId || !form.name) {
      setNotice("Company and project name are required.");
      return;
    }
    const body = {
      companyId: form.companyId,
      name: form.name,
      description: form.description || null,
      budget: form.budget ? Number(form.budget) : null,
      startDate: form.startDate || null,
      deadline: form.deadline || null,
      managerId: form.managerId || null,
      developerIds: form.developerIds,
      status: form.status,
      techStack: form.techStack.split(",").map((t) => t.trim()).filter(Boolean),
      requirements: form.requirements || null,
      internalNotes: form.internalNotes || null,
    };
    const url = editingId ? `/api/projects/${editingId}` : "/api/projects";
    const response = await fetch(url, {
      method: editingId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      setNotice(await readError(response, "Failed to save project"));
      return;
    }
    setNotice(editingId ? "Project updated." : "Project created.");
    resetForm();
    load();
  }

  async function handleDelete(item: Project) {
    if (!window.confirm(`Delete project "${item.name}"? Its tasks are deleted too.`)) return;
    const response = await fetch(`/api/projects/${item.id}`, { method: "DELETE" });
    if (!response.ok) {
      setNotice(await readError(response, "Failed to delete project"));
      return;
    }
    setNotice("Project deleted.");
    load();
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900">Projects</h1>
      <p className="mt-1 text-sm text-slate-500">
        Active work after a deal is won. Developers and designers only see
        projects they are assigned to.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <label className="text-sm text-slate-600">
          Status{" "}
          <select
            className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s.replaceAll("_", " ")}</option>
            ))}
          </select>
        </label>
      </div>

      {canCreate && (
        <form onSubmit={handleSubmit} className="mt-6 rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="text-base font-semibold text-slate-900">
            {editingId ? "Edit project" : "New project"}
          </h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-sm text-slate-600">
              Client company
              <select className={inputCls} value={form.companyId} onChange={(e) => setForm({ ...form, companyId: e.target.value })}>
                <option value="">Select a company</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </label>
            <label className="text-sm text-slate-600">
              Project name
              <input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </label>
            <label className="text-sm text-slate-600">
              Status
              <select className={inputCls} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>{s.replaceAll("_", " ")}</option>
                ))}
              </select>
            </label>
            <label className="text-sm text-slate-600">
              Project manager
              <select className={inputCls} value={form.managerId} onChange={(e) => setForm({ ...form, managerId: e.target.value })}>
                <option value="">None (admins may leave empty)</option>
                {assignees.map((a) => (
                  <option key={a.id} value={a.id}>{a.name} — {a.role.replaceAll("_", " ")}</option>
                ))}
              </select>
            </label>
            <label className="text-sm text-slate-600">
              Budget (USD)
              <input className={inputCls} type="number" min="0" step="0.01" value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} />
            </label>
            <label className="text-sm text-slate-600">
              Technology stack (comma separated)
              <input className={inputCls} value={form.techStack} onChange={(e) => setForm({ ...form, techStack: e.target.value })} placeholder="Next.js, Node.js, PostgreSQL" />
            </label>
            <label className="text-sm text-slate-600">
              Start date
              <input className={inputCls} type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
            </label>
            <label className="text-sm text-slate-600">
              Deadline
              <input className={inputCls} type="date" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} />
            </label>
            <label className="text-sm text-slate-600 sm:col-span-2">
              Description
              <textarea className={inputCls} rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </label>
            <label className="text-sm text-slate-600 sm:col-span-2">
              Requirements
              <textarea className={inputCls} rows={2} value={form.requirements} onChange={(e) => setForm({ ...form, requirements: e.target.value })} />
            </label>
            <label className="text-sm text-slate-600 sm:col-span-2">
              Internal notes (team only, never shown to clients)
              <textarea className={inputCls} rows={2} value={form.internalNotes} onChange={(e) => setForm({ ...form, internalNotes: e.target.value })} />
            </label>
          </div>
          <fieldset className="mt-3">
            <legend className="text-sm text-slate-600">Assigned developers / designers</legend>
            <div className="mt-1 flex flex-wrap gap-2">
              {assignees.filter((a) => a.role === "DEVELOPER" || a.role === "DESIGNER" || a.role === "PROJECT_MANAGER").map((a) => (
                <label key={a.id} className="flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-sm text-slate-700">
                  <input type="checkbox" checked={form.developerIds.includes(a.id)} onChange={() => toggleDeveloper(a.id)} />
                  {a.name}
                </label>
              ))}
              {assignees.length === 0 && <p className="text-sm text-slate-400">No team members available yet — add them on the Team page.</p>}
            </div>
          </fieldset>
          <div className="mt-4 flex gap-2">
            <button className={btnPrimary} type="submit">{editingId ? "Save changes" : "Create project"}</button>
            {editingId && <button className={btnSecondary} type="button" onClick={resetForm}>Cancel</button>}
          </div>
          {notice && <p className="mt-2 text-sm text-slate-600">{notice}</p>}
        </form>
      )}

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      {loading && <p className="mt-4 text-sm text-slate-500">Loading projects…</p>}
      {!loading && items.length === 0 && !error && (
        <p className="mt-4 rounded-lg border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">
          No projects yet. Convert a WON deal from the Deals page, or create a project above.
        </p>
      )}
      <div className="mt-4 grid gap-4">
        {items.map((item) => (
          <article key={item.id} className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <a href={`/projects/${item.id}`} className="text-base font-semibold text-brand-700 hover:underline">{item.name}</a>
                <p className="text-sm text-slate-500">
                  {item.company.name} · {item.status.replaceAll("_", " ")} · {item._count.tasks} tasks
                  {item.manager ? ` · Managed by ${item.manager.name}` : ""}
                  {item.budget != null ? ` · Budget $${item.budget}` : ""}
                </p>
                {item.techStack.length > 0 && <p className="mt-1 text-sm text-slate-600">{item.techStack.join(", ")}</p>}
                {item.developers.length > 0 && (
                  <p className="mt-1 text-sm text-slate-600">Team: {item.developers.map((d) => d.name).join(", ")}</p>
                )}
                {item.deadline && <p className="mt-1 text-sm text-slate-600">Deadline: {item.deadline.slice(0, 10)}</p>}
              </div>
              <div className="flex gap-2">
                {(canCreate) && <button className={btnSecondary} onClick={() => startEdit(item)}>Edit</button>}
                {canDelete && <button className={btnSecondary} onClick={() => handleDelete(item)}>Delete</button>}
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
