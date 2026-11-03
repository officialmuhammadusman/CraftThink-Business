"use client";

import { useCallback, useEffect, useState } from "react";

type Task = {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  deadline: string | null;
  status: string;
  progress: number;
  project: { id: string; name: string };
  assignedTo: { id: string; name: string } | null;
  _count: { comments: number };
};

const TASK_STATUSES = ["TODO", "IN_PROGRESS", "REVIEW", "DONE"];

const btnSecondary =
  "rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50";

async function readError(response: Response, fallback: string): Promise<string> {
  const payload = await response.json().catch(() => null);
  return payload?.error ?? fallback;
}

export default function TasksPage() {
  const [statusFilter, setStatusFilter] = useState("");
  const [mineOnly, setMineOnly] = useState(false);
  const [items, setItems] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [meId, setMeId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: "100" });
      if (statusFilter) params.set("status", statusFilter);
      if (mineOnly && meId) params.set("assignedTo", meId);
      const response = await fetch(`/api/tasks?${params}`);
      if (!response.ok) throw new Error(await readError(response, "Failed to load tasks"));
      const payload = await response.json();
      setItems(payload.data.items as Task[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load tasks");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, mineOnly, meId]);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((p) => setMeId(p.data?.user?.id ?? ""))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function quickUpdate(task: Task, patch: Record<string, unknown>) {
    const response = await fetch(`/api/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!response.ok) {
      setNotice(await readError(response, "Failed to update task"));
      return;
    }
    load();
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900">Tasks</h1>
      <p className="mt-1 text-sm text-slate-500">
        Every task you may see. Developers and designers only see tasks on
        their own projects, or assigned directly to them.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <label className="text-sm text-slate-600">
          Status{" "}
          <select
            className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All</option>
            {TASK_STATUSES.map((s) => (
              <option key={s} value={s}>{s.replaceAll("_", " ")}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1 text-sm text-slate-600">
          <input type="checkbox" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} />
          Assigned to me only
        </label>
      </div>
      {notice && <p className="mt-3 text-sm text-slate-600">{notice}</p>}
      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      {loading && <p className="mt-4 text-sm text-slate-500">Loading tasks…</p>}
      {!loading && items.length === 0 && !error && (
        <p className="mt-4 rounded-lg border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">
          No tasks match this filter.
        </p>
      )}
      <div className="mt-4 grid gap-4">
        {items.map((task) => (
          <article key={task.id} className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <a href={`/projects/${task.project.id}`} className="text-base font-semibold text-brand-700 hover:underline">
                  {task.title}
                </a>
                <p className="text-sm text-slate-500">
                  {task.project.name} · {task.status.replaceAll("_", " ")} · {task.priority} · {task.progress}%
                  {task.assignedTo ? ` · ${task.assignedTo.name}` : " · Unassigned"}
                  {task.deadline ? ` · Due ${task.deadline.slice(0, 10)}` : ""}
                  {` · ${task._count.comments} comments`}
                </p>
                {task.description && <p className="mt-1 text-sm text-slate-700">{task.description}</p>}
              </div>
              <div className="flex gap-2">
                <select
                  className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm"
                  value={task.status}
                  onChange={(e) => quickUpdate(task, { status: e.target.value })}
                >
                  {TASK_STATUSES.map((s) => (<option key={s} value={s}>{s.replaceAll("_", " ")}</option>))}
                </select>
                <a href={`/projects/${task.project.id}`} className={btnSecondary}>Open project</a>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
