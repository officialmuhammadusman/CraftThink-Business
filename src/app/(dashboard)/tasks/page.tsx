"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";

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
  const [filtersOpen, setFiltersOpen] = useState(false);
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
      const message = err instanceof Error ? err.message : "Failed to load tasks";
      setError(message);
      toast.error(message);
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
      toast.error(await readError(response, "Failed to update task"));
      return;
    }
    toast.success("Task updated.");
    load();
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900">Tasks</h1>
      <p className="mt-1 text-base text-slate-500">
        Every task you may see. Developers and designers only see tasks on
        their own projects, or assigned directly to them.
      </p>
      <div className="mt-4 hidden flex-wrap items-center gap-3 md:flex">
        <Label className="text-base text-slate-600">
          Status{" "}
          <Select value={statusFilter || "all"} onValueChange={(v) => setStatusFilter(v === "all" ? "" : v)}>
            <SelectTrigger className="w-auto"><SelectValue placeholder="All" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {TASK_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>{s.replaceAll("_", " ")}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Label>
        <Label htmlFor="mine-only" className="flex items-center gap-1 py-2.5 text-base text-slate-600">
          <Checkbox id="mine-only" checked={mineOnly} onCheckedChange={(v) => setMineOnly(v === true)} />
          Assigned to me only
        </Label>
      </div>
      <div className="mt-4 md:hidden">
        <Button type="button" variant="outline" className="w-full" onClick={() => setFiltersOpen(true)}>
          Filters{(statusFilter || mineOnly) ? " (active)" : ""}
        </Button>
      </div>
      <ResponsiveDialog
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        title="Filters"
        description="Filter tasks by status or assignment."
        footer={
          <Button type="button" className="w-full" onClick={() => setFiltersOpen(false)}>
            Done
          </Button>
        }
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Status</Label>
            <Select value={statusFilter || "all"} onValueChange={(v) => setStatusFilter(v === "all" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="All" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {TASK_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>{s.replaceAll("_", " ")}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Label htmlFor="mine-only-sheet" className="flex items-center gap-2 py-2.5 text-base text-slate-600">
            <Checkbox id="mine-only-sheet" checked={mineOnly} onCheckedChange={(v) => setMineOnly(v === true)} />
            Assigned to me only
          </Label>
        </div>
      </ResponsiveDialog>
      {error && <p className="mt-4 text-base text-red-600">{error}</p>}
      {loading && (
        <div className="mt-4 space-y-3" aria-label="Loading tasks">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
      )}
      {!loading && items.length === 0 && !error && (
        <Card className="mt-4">
          <CardContent className="p-6 text-center">
            <Image src="/images/empty-tasks.svg" alt="" width={320} height={220} className="mx-auto h-auto w-full max-w-xs" />
            <p className="mt-4 text-base text-slate-500">No tasks match this filter.</p>
            <Button type="button" variant="outline" className="mt-4" asChild>
              <a href="/projects">Browse projects</a>
            </Button>
          </CardContent>
        </Card>
      )}
      <div className="mt-4 grid gap-4">
        {items.map((task) => (
          <Card key={task.id}><CardContent className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <a href={`/projects/${task.project.id}`} className="text-base font-semibold text-brand-700 hover:underline">
                  {task.title}
                </a>
                <p className="text-base text-slate-500">
                  {task.project.name} · {task.status.replaceAll("_", " ")} · {task.priority} · {task.progress}%
                  {task.assignedTo ? ` · ${task.assignedTo.name}` : " · Unassigned"}
                  {task.deadline ? ` · Due ${task.deadline.slice(0, 10)}` : ""}
                  {` · ${task._count.comments} comments`}
                </p>
                {task.description && <p className="mt-1 text-base text-slate-700">{task.description}</p>}
              </div>
              <div className="flex gap-2">
                <Select value={task.status} onValueChange={(v) => quickUpdate(task, { status: v })}>
                  <SelectTrigger aria-label={`Status for ${task.title}`} className="w-auto"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TASK_STATUSES.map((s) => (<SelectItem key={s} value={s}>{s.replaceAll("_", " ")}</SelectItem>))}
                  </SelectContent>
                </Select>
                <a href={`/projects/${task.project.id}`} className="inline-flex min-h-12 items-center rounded-md border border-slate-300 bg-white px-4 py-3 text-base font-medium text-slate-700 hover:bg-slate-100">Open project</a>
              </div>
            </div>
          </CardContent></Card>
        ))}
      </div>
    </div>
  );
}
