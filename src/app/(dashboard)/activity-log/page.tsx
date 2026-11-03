"use client";

import { useCallback, useEffect, useState } from "react";

type Entry = {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  details: Record<string, unknown> | null;
  createdAt: string;
  actor: { id: string; name: string; email: string } | null;
};

const ENTITY_TYPES = [
  "Company",
  "Contact",
  "Tag",
  "FollowUp",
  "Meeting",
  "Deal",
  "Project",
];

async function readError(response: Response, fallback: string): Promise<string> {
  const payload = await response.json().catch(() => null);
  return payload?.error ?? fallback;
}

export default function ActivityLogPage() {
  const [items, setItems] = useState<Entry[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [entityType, setEntityType] = useState("");
  const [actorSearch, setActorSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "30" });
      if (entityType) params.set("entityType", entityType);
      const response = await fetch(`/api/activity-log?${params}`);
      if (!response.ok) throw new Error(await readError(response, "Failed to load activity log"));
      const payload = await response.json();
      setItems(payload.data.items as Entry[]);
      setTotalPages(payload.data.pagination.totalPages as number);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load activity log");
    } finally {
      setLoading(false);
    }
  }, [page, entityType]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = actorSearch
    ? items.filter((e) =>
        (e.actor?.name ?? "System").toLowerCase().includes(actorSearch.toLowerCase()) ||
        e.action.toLowerCase().includes(actorSearch.toLowerCase()),
      )
    : items;

  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900">Activity log</h1>
      <p className="mt-1 text-sm text-slate-500">
        Newest first. Admins see everything; other roles see only their own
        actions. Every create, update, delete and stage change is recorded here.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <label className="text-sm text-slate-500">
          Entity type{" "}
          <select
            value={entityType}
            onChange={(e) => {
              setEntityType(e.target.value);
              setPage(1);
            }}
            className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900"
          >
            <option value="">All types</option>
            {ENTITY_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </label>
        <input
          value={actorSearch}
          onChange={(e) => setActorSearch(e.target.value)}
          placeholder="Filter by actor or action…"
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
        />
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}
      {loading ? (
        <p className="mt-4 text-sm text-slate-500">Loading activity…</p>
      ) : filtered.length === 0 ? (
        <p className="mt-4 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
          No activity matches these filters.
        </p>
      ) : (
        <>
          <ul className="mt-4 space-y-2">
            {filtered.map((entry) => (
              <li key={entry.id} className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm">
                <span className="font-medium text-slate-900">
                  {entry.actor?.name ?? "System"}
                </span>{" "}
                <span className="text-slate-600">
                  {entry.action.replaceAll("_", " ").toLowerCase()} {entry.entityType}
                </span>
                <span className="block text-xs text-slate-400">
                  {new Date(entry.createdAt).toLocaleString()}
                  {entry.details?.title ? ` · ${String(entry.details.title)}` : ""}
                  {entry.details?.name ? ` · ${String(entry.details.name)}` : ""}
                  {entry.details?.stageTo ? ` · ${String(entry.details.stageFrom ?? "")} → ${String(entry.details.stageTo)}` : ""}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex items-center gap-2 text-sm">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
            >
              Previous
            </button>
            <span className="text-slate-500">
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </>
      )}
    </div>
  );
}
