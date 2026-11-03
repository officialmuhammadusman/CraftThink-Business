"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";

type Member = {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  createdAt: string;
};

const ROLES = [
  "SUPER_ADMIN",
  "ADMIN",
  "PROJECT_MANAGER",
  "SALES_EXECUTIVE",
  "DEVELOPER",
  "DESIGNER",
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

export default function TeamPage() {
  const [items, setItems] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "DEVELOPER" });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/users");
      if (!response.ok) throw new Error(await readError(response, "Failed to load team"));
      const payload = await response.json();
      setItems(payload.data.items as Member[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load team");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    setNotice(null);
    if (!form.name || !form.email || form.password.length < 8) {
      setNotice("Name, email and a password of at least 8 characters are required.");
      return;
    }
    const response = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (!response.ok) {
      setNotice(await readError(response, "Failed to create user"));
      return;
    }
    setNotice("Team member created. Share their login privately — never by email in this app.");
    setForm({ name: "", email: "", password: "", role: "DEVELOPER" });
    load();
  }

  async function patchMember(member: Member, patch: Record<string, unknown>) {
    const response = await fetch(`/api/users/${member.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!response.ok) {
      setNotice(await readError(response, "Failed to update member"));
      return;
    }
    setNotice("Member updated.");
    load();
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900">Team</h1>
      <p className="mt-1 text-sm text-slate-500">
        Admins only. Deactivated members cannot sign in and lose access
        immediately, even with a valid session.
      </p>

      <form onSubmit={handleCreate} className="mt-6 rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-base font-semibold text-slate-900">Add team member</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-sm text-slate-600">
            Full name
            <input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <label className="text-sm text-slate-600">
            Email
            <input className={inputCls} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </label>
          <label className="text-sm text-slate-600">
            Temporary password (min 8 characters — they change it in Settings)
            <input className={inputCls} type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </label>
          <label className="text-sm text-slate-600">
            Role
            <select className={inputCls} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              {ROLES.map((r) => (<option key={r} value={r}>{r.replaceAll("_", " ")}</option>))}
            </select>
          </label>
        </div>
        <button className={`${btnPrimary} mt-4`} type="submit">Create member</button>
        {notice && <p className="mt-2 text-sm text-slate-600">{notice}</p>}
      </form>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      {loading && <p className="mt-4 text-sm text-slate-500">Loading team…</p>}
      <div className="mt-4 grid gap-4">
        {items.map((m) => (
          <article key={m.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-4">
            <div>
              <p className="text-base font-semibold text-slate-900">{m.name}</p>
              <p className="text-sm text-slate-500">
                {m.email} · {m.role.replaceAll("_", " ")} · {m.active ? "Active" : "Deactivated"}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <select
                className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm"
                value={m.role}
                onChange={(e) => patchMember(m, { role: e.target.value })}
              >
                {ROLES.map((r) => (<option key={r} value={r}>{r.replaceAll("_", " ")}</option>))}
              </select>
              <button
                className={btnSecondary}
                onClick={() => patchMember(m, { active: !m.active })}
              >
                {m.active ? "Deactivate" : "Reactivate"}
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
