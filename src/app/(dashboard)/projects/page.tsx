"use client";

import Image from "next/image";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { MoreHorizontal } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ResponsiveDialog, ErrorDialog } from "@/components/ui/responsive-dialog";
import { FieldError, logicalDateErrors, zodFieldErrors } from "@/components/ui/field-error";
import { projectSchema } from "@/lib/validation";

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
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [confirmItem, setConfirmItem] = useState<Project | null>(null);
  const [errorDialog, setErrorDialog] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
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
      const message = err instanceof Error ? err.message : "Failed to load projects";
      setError(message);
      toast.error(message);
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
    const parsed = projectSchema.safeParse({
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
    });
    const errs = { ...zodFieldErrors(parsed), ...logicalDateErrors({ startDate: form.startDate, deadline: form.deadline }) };
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      return;
    }
    setFieldErrors({});
    setSubmitting(true);
    try {
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
        const payload = await response.json().catch(() => null);
        const mapped = serverFieldErrors(payload);
        const message = payload?.error ?? payload?.message ?? "Failed to save project";
        if (mapped) {
          setFieldErrors(mapped);
          toast.error("Please fix the highlighted fields.");
        } else {
          toast.error(message);
        }
        return;
      }
      toast.success(editingId ? "Project updated." : "Project created.");
      resetForm();
      load();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(item: Project) {
    const response = await fetch(`/api/projects/${item.id}`, { method: "DELETE" });
    if (!response.ok) {
      const message = await readError(response, "Failed to delete project");
      toast.error(message);
      setErrorDialog(message);
      return;
    }
    toast.success("Project deleted.");
    load();
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900">Projects</h1>
      <p className="mt-1 text-base text-slate-500">
        Active work after a deal is won. Developers and designers only see
        projects they are assigned to.
      </p>

      <div className="mt-4 hidden flex-wrap gap-2 md:flex">
        <Label className="text-base text-slate-600">
          Status{" "}
          <Select value={statusFilter || "all"} onValueChange={(v) => setStatusFilter(v === "all" ? "" : v)}>
            <SelectTrigger className="w-auto"><SelectValue placeholder="All" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s}>{s.replaceAll("_", " ")}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Label>
      </div>
      <div className="mt-4 md:hidden">
        <Button type="button" variant="outline" className="w-full" onClick={() => setFiltersOpen(true)}>
          Filters{statusFilter ? " (active)" : ""}
        </Button>
      </div>
      <ResponsiveDialog
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        title="Filters"
        description="Filter projects by status."
        footer={
          <Button type="button" className="w-full" onClick={() => setFiltersOpen(false)}>
            Done
          </Button>
        }
      >
        <div className="space-y-2">
          <Label>Status</Label>
          <Select value={statusFilter || "all"} onValueChange={(v) => setStatusFilter(v === "all" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="All" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s}>{s.replaceAll("_", " ")}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </ResponsiveDialog>

      {canCreate && (
        <form onSubmit={handleSubmit} className="mt-6 rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="text-base font-semibold text-slate-900">
            {editingId ? "Edit project" : "New project"}
          </h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Label className="text-base text-slate-600">
              Client company
              <Select value={form.companyId || "__none"} onValueChange={(v) => setForm({ ...form, companyId: v === "__none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="Select a company" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Select a company</SelectItem>
                  {companies.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError message={fieldErrors.companyId} />
            </Label>
            <Label className="text-base text-slate-600">
              Project name
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <FieldError message={fieldErrors.name} />
            </Label>
            <Label className="text-base text-slate-600">
              Status
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>{s.replaceAll("_", " ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError message={fieldErrors.status} />
            </Label>
            <Label className="text-base text-slate-600">
              Project manager
              <Select value={form.managerId || "__none"} onValueChange={(v) => setForm({ ...form, managerId: v === "__none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="None (admins may leave empty)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">None (admins may leave empty)</SelectItem>
                  {assignees.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name} — {a.role.replaceAll("_", " ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError message={fieldErrors.managerId} />
            </Label>
            <Label className="text-base text-slate-600">
              Budget (USD)
              <Input type="number" min="0" step="0.01" value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} />
              <FieldError message={fieldErrors.budget} />
            </Label>
            <Label className="text-base text-slate-600">
              Technology stack (comma separated)
              <Input value={form.techStack} onChange={(e) => setForm({ ...form, techStack: e.target.value })} placeholder="Next.js, Node.js, PostgreSQL" />
              <FieldError message={fieldErrors.techStack} />
            </Label>
            <Label className="text-base text-slate-600">
              Start date
              <DatePicker className="min-h-12 text-base" value={form.startDate} onChange={(v) => setForm({ ...form, startDate: v })} placeholder="Pick a start date" />
              <FieldError message={fieldErrors.startDate} />
            </Label>
            <Label className="text-base text-slate-600">
              Deadline
              <DatePicker className="min-h-12 text-base" value={form.deadline} onChange={(v) => setForm({ ...form, deadline: v })} placeholder="Pick a deadline" />
              <FieldError message={fieldErrors.deadline} />
            </Label>
            <Label className="text-base text-slate-600 sm:col-span-2">
              Description
              <Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              <FieldError message={fieldErrors.description} />
            </Label>
            <Label className="text-base text-slate-600 sm:col-span-2">
              Requirements
              <Textarea rows={2} value={form.requirements} onChange={(e) => setForm({ ...form, requirements: e.target.value })} />
              <FieldError message={fieldErrors.requirements} />
            </Label>
            <Label className="text-base text-slate-600 sm:col-span-2">
              Internal notes (team only, never shown to clients)
              <Textarea rows={2} value={form.internalNotes} onChange={(e) => setForm({ ...form, internalNotes: e.target.value })} />
              <FieldError message={fieldErrors.internalNotes} />
            </Label>
          </div>
          <fieldset className="mt-3">
            <legend className="text-base text-slate-600">Assigned developers / designers</legend>
            <div className="mt-1 flex flex-wrap gap-2">
              {assignees.filter((a) => a.role === "DEVELOPER" || a.role === "DESIGNER" || a.role === "PROJECT_MANAGER").map((a) => (
                <Label key={a.id} htmlFor={`dev-${a.id}`} className="flex items-center gap-1 rounded-md border border-slate-200 px-3 py-2.5 text-base text-slate-700">
                  <Checkbox id={`dev-${a.id}`} checked={form.developerIds.includes(a.id)} onCheckedChange={(v) => { if (v !== form.developerIds.includes(a.id)) toggleDeveloper(a.id); }} />
                  {a.name}
                </Label>
              ))}
              {assignees.length === 0 && <p className="text-base text-slate-400">No team members available yet — add them on the Team page.</p>}
            </div>
            <FieldError message={fieldErrors.developerIds} />
          </fieldset>
          <div className="mt-4 flex gap-2">
            <Button variant="default" type="submit" disabled={submitting}>{submitting ? "Saving…" : editingId ? "Save changes" : "Create project"}</Button>
            {editingId && <Button variant="outline" type="button" onClick={resetForm}>Cancel</Button>}
          </div>
        </form>
      )}

      {error && <p className="mt-4 text-base text-red-600">{error}</p>}
      {loading && (
        <div className="mt-4 space-y-3" aria-label="Loading projects">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
      )}
      {!loading && items.length === 0 && !error && (
        <Card className="mt-4">
          <CardContent className="p-6 text-center">
            <Image src="/images/empty-projects.svg" alt="" width={320} height={220} className="mx-auto h-auto w-full max-w-xs" />
            <p className="mt-4 text-base text-slate-500">
              No projects yet. Convert a WON deal from the Deals page, or create a project above.
            </p>
            {canCreate && (
              <Button type="button" className="mt-4" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
                Create a project
              </Button>
            )}
          </CardContent>
        </Card>
      )}
      <div className="mt-4 grid gap-4">
        {items.map((item) => (
          <Card key={item.id}><CardContent className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <a href={`/projects/${item.id}`} className="text-base font-semibold text-brand-700 hover:underline">{item.name}</a>
                <p className="text-base text-slate-500">
                  {item.company.name} · {item.status.replaceAll("_", " ")} · {item._count.tasks} tasks
                  {item.manager ? ` · Managed by ${item.manager.name}` : ""}
                  {item.budget != null ? ` · Budget $${item.budget}` : ""}
                </p>
                {item.techStack.length > 0 && <p className="mt-1 text-base text-slate-600">{item.techStack.join(", ")}</p>}
                {item.developers.length > 0 && (
                  <p className="mt-1 text-base text-slate-600">Team: {item.developers.map((d) => d.name).join(", ")}</p>
                )}
                {item.deadline && <p className="mt-1 text-base text-slate-600">Deadline: {item.deadline.slice(0, 10)}</p>}
              </div>
              {(canCreate || canDelete) && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="icon" className="min-h-12 min-w-12" aria-label={`Actions for ${item.name}`}>
                      <MoreHorizontal className="size-5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {canCreate && (
                      <DropdownMenuItem onClick={() => startEdit(item)}>Edit</DropdownMenuItem>
                    )}
                    {canDelete && (
                      <DropdownMenuItem className="text-red-600" onClick={() => setConfirmItem(item)}>Delete</DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </CardContent></Card>
        ))}
      </div>

      <ConfirmDialog
        open={confirmItem !== null}
        onOpenChange={(o) => !o && setConfirmItem(null)}
        title="Delete project?"
        description={confirmItem ? `Delete project "${confirmItem.name}"? Its tasks are deleted too.` : ""}
        confirmLabel="Delete"
        onConfirm={async () => {
          if (confirmItem) await handleDelete(confirmItem);
        }}
      />
      <ErrorDialog
        open={errorDialog !== null}
        onOpenChange={(o) => !o && setErrorDialog(null)}
        title="Could not delete project"
        message={errorDialog ?? ""}
        hint="The project was not deleted. Check the message above and try again."
      />
    </div>
  );
}
