"use client";

import { useEffect, useState } from "react";
import {
  api,
  btnPrimary,
  btnDanger,
  btnSecondary,
  inputCls,
  Field,
  ErrorAlert,
  useMe,
  fmtDateTime,
} from "../emails/ui";

type Row = {
  id: string;
  email: string;
  reason: string | null;
  scope: string;
  createdAt: string;
};

export default function SuppressionPage() {
  const { role } = useMe();
  const [items, setItems] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Create form
  const [newEmail, setNewEmail] = useState("");
  const [newReason, setNewReason] = useState("");
  const [newScope, setNewScope] = useState("GLOBAL");
  const [creating, setCreating] = useState(false);

  // Edit form (one row at a time)
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editReason, setEditReason] = useState("");
  const [editScope, setEditScope] = useState("GLOBAL");
  const [savingEdit, setSavingEdit] = useState(false);

  const load = (p: number, s: string) => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(p), limit: "20" });
    if (s) params.set("search", s);
    api<{ items: Row[]; total: number; totalPages: number }>(
      `/api/suppression?${params}`,
    )
      .then((data) => {
        setItems(data.items);
        setTotal(data.total);
        setTotalPages(data.totalPages);
        setError(null);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load suppression list");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load(page, appliedSearch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, appliedSearch]);

  const canAdd = role === "SUPER_ADMIN" || role === "ADMIN" || role === "SALES_EXECUTIVE";
  const canEdit = role === "SUPER_ADMIN" || role === "ADMIN";
  const canDelete = role === "SUPER_ADMIN";

  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900">Suppression list</h1>
      <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 shadow-sm">
        <p className="font-semibold">Compliance note</p>
        <p className="mt-1">
          This list is a tracking and compliance record. Anyone on it must not
          be emailed again: CSV imports skip suppressed recipients, and
          marking an email Unsubscribed adds its recipient here automatically.
          Removing an entry is Super-Admin-only, because a mistaken removal
          re-exposes someone who asked to stop.
        </p>
      </div>

      {canAdd ? (
        <form
          className="mt-4 grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            setNotice(null);
            setCreating(true);
            try {
              await api("/api/suppression", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  email: newEmail,
                  reason: newReason || null,
                  scope: newScope || "GLOBAL",
                }),
              });
              setNewEmail("");
              setNewReason("");
              setNotice(`${newEmail} added to the suppression list.`);
              load(page, appliedSearch);
            } catch (err: unknown) {
              setError(err instanceof Error ? err.message : "Failed to add entry");
            } finally {
              setCreating(false);
            }
          }}
        >
          <Field label="Email *">
            <input required type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Reason">
            <input value={newReason} onChange={(e) => setNewReason(e.target.value)} placeholder="e.g. Unsubscribed, bounced" className={inputCls} />
          </Field>
          <Field label="Scope">
            <input value={newScope} onChange={(e) => setNewScope(e.target.value)} className={inputCls} />
          </Field>
          <div className="sm:col-span-3">
            <button type="submit" disabled={creating} className={btnPrimary}>
              {creating ? "Adding…" : "Add to suppression list"}
            </button>
          </div>
        </form>
      ) : (
        <p className="mt-4 text-sm text-slate-500">
          Only Super Admins, Admins, and Sales Executives can add entries.
        </p>
      )}

      {notice ? (
        <p className="mt-3 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">{notice}</p>
      ) : null}

      <form
        className="mt-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          setAppliedSearch(search.trim());
        }}
      >
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by email…" className={inputCls} />
        <button type="submit" className={btnPrimary}>Search</button>
      </form>

      <div className="mt-4">
        <ErrorAlert message={error} />
        {loading ? (
          <p className="text-sm text-slate-500">Loading suppression list…</p>
        ) : items.length === 0 ? (
          <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
            No suppressed addresses yet.
          </p>
        ) : (
          <>
            <p className="text-xs text-slate-500">{total} entr(ies)</p>
            <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-2">Email</th>
                    <th className="px-3 py-2">Reason</th>
                    <th className="px-3 py-2">Scope</th>
                    <th className="px-3 py-2">Added</th>
                    <th className="px-3 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((row) => (
                    <tr key={row.id} className="border-b border-slate-100 align-top last:border-0">
                      <td className="px-3 py-2 font-medium">{row.email}</td>
                      <td className="px-3 py-2">
                        {editingId === row.id ? (
                          <input value={editReason} onChange={(e) => setEditReason(e.target.value)} className={inputCls} />
                        ) : (
                          row.reason ?? "—"
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {editingId === row.id ? (
                          <input value={editScope} onChange={(e) => setEditScope(e.target.value)} className={inputCls} />
                        ) : (
                          row.scope
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-500">{fmtDateTime(row.createdAt)}</td>
                      <td className="px-3 py-2">
                        {editingId === row.id ? (
                          <span className="flex gap-2">
                            <button
                              type="button"
                              disabled={savingEdit}
                              className={btnPrimary}
                              onClick={async () => {
                                setSavingEdit(true);
                                try {
                                  await api(`/api/suppression/${row.id}`, {
                                    method: "PATCH",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ reason: editReason || null, scope: editScope }),
                                  });
                                  setEditingId(null);
                                  setNotice("Entry updated.");
                                  load(page, appliedSearch);
                                } catch (err: unknown) {
                                  setError(err instanceof Error ? err.message : "Failed to update entry");
                                } finally {
                                  setSavingEdit(false);
                                }
                              }}
                            >
                              Save
                            </button>
                            <button type="button" className={btnSecondary} onClick={() => setEditingId(null)}>
                              Cancel
                            </button>
                          </span>
                        ) : (
                          <span className="flex gap-2">
                            {canEdit ? (
                              <button
                                type="button"
                                className={btnSecondary}
                                onClick={() => {
                                  setEditingId(row.id);
                                  setEditReason(row.reason ?? "");
                                  setEditScope(row.scope);
                                }}
                              >
                                Edit
                              </button>
                            ) : null}
                            {canDelete ? (
                              <button
                                type="button"
                                className={btnDanger}
                                onClick={async () => {
                                  if (!window.confirm(`Remove ${row.email} from the suppression list? They could then be emailed again. Only do this if the suppression was a mistake.`)) return;
                                  try {
                                    await api(`/api/suppression/${row.id}`, { method: "DELETE" });
                                    setNotice(`${row.email} removed from the suppression list.`);
                                    load(page, appliedSearch);
                                  } catch (err: unknown) {
                                    setError(err instanceof Error ? err.message : "Failed to remove entry");
                                  }
                                }}
                              >
                                Remove
                              </button>
                            ) : null}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex items-center gap-2">
              <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded-md border border-slate-300 bg-white px-3 py-1 text-sm disabled:opacity-50">
                Previous
              </button>
              <span className="text-sm text-slate-500">Page {page} of {totalPages}</span>
              <button type="button" disabled={page >= totalPages} onClick={() => setPage(page + 1)} className="rounded-md border border-slate-300 bg-white px-3 py-1 text-sm disabled:opacity-50">
                Next
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
