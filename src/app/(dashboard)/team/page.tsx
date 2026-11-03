"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FieldError, zodFieldErrors } from "@/components/ui/field-error";
import { memberCreateSchema } from "@/lib/validation";

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
  "flex min-h-12 w-full rounded-md border border-slate-300 bg-white px-3 py-3 text-base text-slate-900";
const btnPrimary =
  "inline-flex min-h-12 items-center justify-center rounded-md bg-brand-600 px-4 py-3 text-base font-medium text-white hover:bg-brand-700 disabled:opacity-50";
const btnSecondary =
  "inline-flex min-h-12 items-center justify-center rounded-md border border-slate-300 bg-white px-3 py-3 text-base font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50";

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
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [creating, setCreating] = useState(false);
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
      const message = err instanceof Error ? err.message : "Failed to load team";
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    const parsed = memberCreateSchema.safeParse(form);
    if (!parsed.success) {
      setFieldErrors(zodFieldErrors(parsed));
      return;
    }
    setFieldErrors({});
    setCreating(true);
    try {
      const response = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        const mapped = serverFieldErrors(payload);
        const message = payload?.error ?? payload?.message ?? "Failed to create user";
        if (mapped) {
          setFieldErrors(mapped);
          toast.error("Please fix the highlighted fields.");
        } else {
          toast.error(message);
        }
        return;
      }
      toast.success("Team member created. New members start with no access until you grant it in their permission table below. Share their login privately — never by email in this app.");
      setForm({ name: "", email: "", password: "", role: "DEVELOPER" });
      load();
    } finally {
      setCreating(false);
    }
  }

  async function patchMember(member: Member, patch: Record<string, unknown>) {
    const response = await fetch(`/api/users/${member.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!response.ok) {
      toast.error(await readError(response, "Failed to update member"));
      return;
    }
    toast.success("Member updated.");
    load();
  }

  async function savePermission(member: Member, mod: string, level: string) {
    setSaving(`${member.id}:${mod}`);
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
      toast.success(`Permission saved: ${member.name} — ${label(mod)}: ${label(level)}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save permission");
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
            <input id="member-name" className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <FieldError message={fieldErrors.name} />
          </label>
          <label className="text-sm text-slate-600">
            Email
            <input className={inputCls} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <FieldError message={fieldErrors.email} />
          </label>
          <label className="text-sm text-slate-600">
            Temporary password (min 8 characters — they change it in Settings)
            <input className={inputCls} type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            <FieldError message={fieldErrors.password} />
          </label>
          <label className="text-sm text-slate-600">
            Job title
            <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {MEMBER_ROLES.map((r) => (<SelectItem key={r} value={r}>{label(r)}</SelectItem>))}
              </SelectContent>
            </Select>
            <FieldError message={fieldErrors.role} />
          </label>
        </div>
        <button className={`${btnPrimary} mt-4`} type="submit" disabled={creating}>{creating ? "Creating…" : "Create member"}</button>
      </form>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      {loading && (
        <div className="mt-4 space-y-3" aria-label="Loading team">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
      )}
      {!loading && !error && items.length === 0 && (
        <div className="mt-4 rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center">
          <p className="text-base text-slate-500">No team members yet.</p>
          <Button
            type="button"
            variant="outline"
            className="mt-3"
            onClick={() => document.getElementById("member-name")?.scrollIntoView({ behavior: "smooth", block: "center" })}
          >
            Add your first member
          </Button>
        </div>
      )}
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
                    <Select value={m.role} onValueChange={(v) => patchMember(m, { role: v })}>
                      <SelectTrigger aria-label={`Job title for ${m.name}`} className="w-auto"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {MEMBER_ROLES.map((r) => (<SelectItem key={r} value={r}>{label(r)}</SelectItem>))}
                      </SelectContent>
                    </Select>
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
                      <Select value={memberPerms[mod] ?? "NONE"} disabled={saving === `${m.id}:${mod}`} onValueChange={(v) => savePermission(m, mod, v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {LEVELS.map((l) => (
                            <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
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
