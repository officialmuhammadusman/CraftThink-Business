"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";

type Grant = { module: string; level: string };

type Member = {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  createdAt: string;
  permissionGrants?: Grant[];
};

// Job titles only. There is no separate full-control role to offer:
// the one Super Admin owns the system, and every other member's access
// comes from the permission table below, never from their title.
const MEMBER_ROLES = [
  "PROJECT_MANAGER",
  "SALES_EXECUTIVE",
  "DEVELOPER",
  "DESIGNER",
] as const;

const MODULES = [
  "COMPANIES",
  "CAMPAIGNS",
  "TEMPLATES",
  "EMAILS",
  "FOLLOW_UPS",
  "MEETINGS",
  "DEALS",
  "PROJECTS",
  "TASKS",
  "ACTIVITY_LOG",
  "TEAM",
  "SETTINGS",
] as const;

const LEVELS = [
  { value: "NONE", label: "No access" },
  { value: "ASSIGNED", label: "Only assigned" },
  { value: "ALL", label: "All" },
] as const;

function label(value: string): string {
  return value.replaceAll("_", " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
}

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

function grantsToMap(grants: Grant[] | undefined): Record<string, string> {
  const map: Record<string, string> = {};
  for (const mod of MODULES) map[mod] = "NONE";
  for (const grant of grants ?? []) {
    if ((MODULES as readonly string[]).includes(grant.module)) {
      map[grant.module] = grant.level;
    }
  }
  return map;
}

export default function TeamPage() {
  const [items, setItems] = useState<Member[]>([]);
  const [perms, setPerms] = useState<Record<string, Record<string, string>>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "DEVELOPER" });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/users");
      if (!response.ok) throw new Error(await readError(response, "Failed to load team"));
      const payload = await response.json();
      const members = payload.data.items as Member[];
      setItems(members);
      const next: Record<string, Record<string, string>> = {};
      for (const member of members) {
        next[member.id] =
          member.role === "SUPER_ADMIN"
            ? Object.fromEntries(MODULES.map((m) => [m, "ALL"]))
            : grantsToMap(member.permissionGrants);
      }
      setPerms(next);
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
    setNotice("Team member created. New members start with no access until you grant it in their permission table below. Share their login privately — never by email in this app.");
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

  async function savePermission(member: Member, mod: string, level: string) {
    setSaving(`${member.id}:${mod}`);
    setNotice(null);
    try {
      const response = await fetch(`/api/users/${member.id}/permissions`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: member.id, module: mod, level }),
      });
      if (!response.ok) throw new Error(await readError(response, "Failed to save permission"));
      setPerms((prev) => ({
        ...prev,
        [member.id]: { ...(prev[member.id] ?? {}), [mod]: level },
      }));
      setNotice(`Permission saved: ${member.name} — ${label(mod)}: ${label(level)}.`);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Failed to save permission");
    } finally {
      setSaving(null);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900">Team</h1>
      <p className="mt-1 text-sm text-slate-500">
        Super Admin only. Deactivated members cannot sign in and lose access
        immediately, even with a valid session.
      </p>
      <p className="mt-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
        Members see only tasks given to them or info shared with them — nothing else.
        A job title (Project Manager, Sales Executive, Developer, Designer) is just a
        title: it grants nothing on its own. Access comes from the permission table
        for each member below — <strong>No access</strong> blocks the module entirely
        (403), <strong>Only assigned</strong> shows only records assigned to them, and{" "}
        <strong>All</strong> shows everything in that module. New members start with no
        access until you grant it here.
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
            Job title
            <select className={inputCls} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              {MEMBER_ROLES.map((r) => (<option key={r} value={r}>{label(r)}</option>))}
            </select>
          </label>
        </div>
        <button className={`${btnPrimary} mt-4`} type="submit">Create member</button>
        {notice && <p className="mt-2 text-sm text-slate-600">{notice}</p>}
      </form>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      {loading && <p className="mt-4 text-sm text-slate-500">Loading team…</p>}
      <div className="mt-4 grid gap-4">
        {items.map((m) => {
          const isSuperAdmin = m.role === "SUPER_ADMIN";
          const memberPerms = perms[m.id] ?? grantsToMap(m.permissionGrants);
          return (
            <article key={m.id} className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-base font-semibold text-slate-900">{m.name}</p>
                  <p className="text-sm text-slate-500">
                    {m.email} · {label(m.role)} · {m.active ? "Active" : "Deactivated"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {isSuperAdmin ? (
                    <span className="rounded-md border border-slate-300 bg-slate-50 px-2 py-1 text-sm text-slate-600">
                      Super Admin — full access, cannot be changed here
                    </span>
                  ) : (
                    <select
                      className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm"
                      value={m.role}
                      onChange={(e) => patchMember(m, { role: e.target.value })}
                      aria-label={`Job title for ${m.name}`}
                    >
                      {MEMBER_ROLES.map((r) => (<option key={r} value={r}>{label(r)}</option>))}
                    </select>
                  )}
                  <button
                    className={btnSecondary}
                    onClick={() => patchMember(m, { active: !m.active })}
                  >
                    {m.active ? "Deactivate" : "Reactivate"}
                  </button>
                </div>
              </div>

              <h3 className="mt-4 text-sm font-semibold text-slate-900">Permissions</h3>
              {isSuperAdmin ? (
                <p className="mt-1 text-sm text-slate-500">
                  Full access to every module. Grants do not apply to the Super Admin.
                </p>
              ) : (
                <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {MODULES.map((mod) => (
                    <label key={mod} className="text-sm text-slate-600">
                      {label(mod)}
                      <select
                        className={inputCls}
                        value={memberPerms[mod] ?? "NONE"}
                        disabled={saving === `${m.id}:${mod}`}
                        onChange={(e) => savePermission(m, mod, e.target.value)}
                      >
                        {LEVELS.map((l) => (
                          <option key={l.value} value={l.value}>{l.label}</option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
