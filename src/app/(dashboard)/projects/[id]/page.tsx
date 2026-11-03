"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

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
};
type Task = {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  startDate: string | null;
  deadline: string | null;
  status: string;
  progress: number;
  assignedTo: { id: string; name: string } | null;
  _count: { comments: number };
};
type Comment = {
  id: string;
  body: string;
  createdAt: string;
  author: { id: string; name: string } | null;
};
type Assignee = { id: string; name: string; role: string };

const TASK_STATUSES = ["TODO", "IN_PROGRESS", "REVIEW", "DONE"];
const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"];


async function readError(response: Response, fallback: string): Promise<string> {
  const payload = await response.json().catch(() => null);
  return payload?.error ?? fallback;
}

const emptyTask = {
  title: "",
  description: "",
  assignedToId: "",
  priority: "MEDIUM",
  startDate: "",
  deadline: "",
  status: "TODO",
  progress: "0",
};

export default function ProjectDetailPage() {
  const params = useParams();
  const projectId = params.id as string;
  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [meId, setMeId] = useState("");
  const [meRole, setMeRole] = useState("");
  const [taskForm, setTaskForm] = useState(emptyTask);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [comments, setComments] = useState<Record<string, Comment[]>>({});
  const [commentDraft, setCommentDraft] = useState<Record<string, string>>({});
  const [openComments, setOpenComments] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [pRes, tRes] = await Promise.all([
        fetch(`/api/projects/${projectId}`),
        fetch(`/api/projects/${projectId}/tasks?limit=100`),
      ]);
      if (!pRes.ok) throw new Error(await readError(pRes, "Failed to load project"));
      if (!tRes.ok) throw new Error(await readError(tRes, "Failed to load tasks"));
      const p = await pRes.json();
      const t = await tRes.json();
      setProject(p.data as Project);
      setTasks(t.data.items as Task[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load project");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    fetch("/api/companies/assignees")
      .then((r) => r.json())
      .then((p) => setAssignees(p.data?.items ?? []))
      .catch(() => undefined);
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((p) => {
        setMeId(p.data?.user?.id ?? "");
        setMeRole(p.data?.user?.role ?? "");
      })
      .catch(() => undefined);
  }, []);

  const isManagerOrAdmin =
    meRole === "SUPER_ADMIN" ||
    meRole === "ADMIN" ||
    (meRole === "PROJECT_MANAGER" && project?.manager?.id === meId);
  const isProjectDeveloper =
    project?.developers.some((d) => d.id === meId) ?? false;
  const canManageTasks = isManagerOrAdmin || isProjectDeveloper;

  async function loadComments(taskId: string) {
    const response = await fetch(`/api/tasks/${taskId}/comments`);
    if (!response.ok) return;
    const payload = await response.json();
    setComments((c) => ({ ...c, [taskId]: payload.data.items as Comment[] }));
  }

  function toggleComments(taskId: string) {
    const next = !openComments[taskId];
    setOpenComments((o) => ({ ...o, [taskId]: next }));
    if (next && !comments[taskId]) loadComments(taskId);
  }

  function startEditTask(task: Task) {
    setEditingTaskId(task.id);
    setTaskForm({
      title: task.title,
      description: task.description ?? "",
      assignedToId: task.assignedTo?.id ?? "",
      priority: task.priority,
      startDate: task.startDate ? task.startDate.slice(0, 10) : "",
      deadline: task.deadline ? task.deadline.slice(0, 10) : "",
      status: task.status,
      progress: String(task.progress),
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleTaskSubmit(event: FormEvent) {
    event.preventDefault();
    setNotice(null);
    if (!taskForm.title) {
      setNotice("Task title is required.");
      return;
    }
    const body = {
      title: taskForm.title,
      description: taskForm.description || null,
      assignedToId: taskForm.assignedToId || null,
      priority: taskForm.priority,
      startDate: taskForm.startDate || null,
      deadline: taskForm.deadline || null,
      status: taskForm.status,
      progress: Number(taskForm.progress),
    };
    const url = editingTaskId
      ? `/api/tasks/${editingTaskId}`
      : `/api/projects/${projectId}/tasks`;
    const response = await fetch(url, {
      method: editingTaskId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      setNotice(await readError(response, "Failed to save task"));
      return;
    }
    setNotice(editingTaskId ? "Task updated." : "Task created.");
    setEditingTaskId(null);
    setTaskForm(emptyTask);
    load();
  }

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

  async function handleDeleteTask(task: Task) {
    if (!window.confirm(`Delete task "${task.title}"?`)) return;
    const response = await fetch(`/api/tasks/${task.id}`, { method: "DELETE" });
    if (!response.ok) {
      setNotice(await readError(response, "Failed to delete task"));
      return;
    }
    setNotice("Task deleted.");
    load();
  }

  async function handleComment(taskId: string) {
    const body = (commentDraft[taskId] ?? "").trim();
    if (!body) return;
    const response = await fetch(`/api/tasks/${taskId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    });
    if (!response.ok) {
      setNotice(await readError(response, "Failed to add comment"));
      return;
    }
    setCommentDraft((d) => ({ ...d, [taskId]: "" }));
    loadComments(taskId);
    load();
  }

  if (loading) return <p className="text-base text-slate-500">Loading project…</p>;
  if (error) return <p className="text-base text-red-600">{error}</p>;
  if (!project) return <p className="text-base text-slate-500">Project not found.</p>;

  const avgProgress =
    tasks.length === 0
      ? 0
      : Math.round(tasks.reduce((sum, t) => sum + t.progress, 0) / tasks.length);

  return (
    <div>
      <a href="/projects" className="text-base text-brand-700 hover:underline">← All projects</a>
      <h1 className="mt-2 text-2xl font-semibold text-slate-900">{project.name}</h1>
      <p className="mt-1 text-base text-slate-500">
        {project.company.name} · {project.status.replaceAll("_", " ")}
        {project.manager ? ` · Managed by ${project.manager.name}` : ""}
        {project.budget != null ? ` · Budget $${project.budget}` : ""}
        {project.deal ? ` · From deal: ${project.deal.title}` : ""}
      </p>
      {project.techStack.length > 0 && <p className="mt-1 text-base text-slate-600">Stack: {project.techStack.join(", ")}</p>}
      {project.developers.length > 0 && (
        <p className="mt-1 text-base text-slate-600">Team: {project.developers.map((d) => d.name).join(", ")}</p>
      )}
      {project.description && <p className="mt-2 text-base text-slate-700">{project.description}</p>}
      {project.requirements && (
        <p className="mt-2 text-base text-slate-700"><span className="font-medium">Requirements:</span> {project.requirements}</p>
      )}
      {project.internalNotes && (
        <p className="mt-2 rounded-md bg-amber-50 p-3 text-base text-slate-700"><span className="font-medium">Internal notes:</span> {project.internalNotes}</p>
      )}
      <p className="mt-2 text-base text-slate-600">
        Overall progress: {avgProgress}% ({tasks.filter((t) => t.status === "DONE").length}/{tasks.length} tasks done)
      </p>
      <div className="mt-2 h-2 w-full max-w-md rounded-full bg-slate-200">
        <div className="h-2 rounded-full bg-brand-600" style={{ width: `${avgProgress}%` }} />
      </div>
      {notice && <p className="mt-3 text-base text-slate-600">{notice}</p>}

      {canManageTasks && (
        <form onSubmit={handleTaskSubmit} className="mt-6 rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="text-base font-semibold text-slate-900">{editingTaskId ? "Edit task" : "New task"}</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Label className="text-base text-slate-600 sm:col-span-2">
              Title
              <Input value={taskForm.title} onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })} />
            </Label>
            <Label className="text-base text-slate-600">
              Assigned to
              <select className="min-h-12 w-full rounded-md border border-slate-300 bg-white px-3 py-3 text-base" value={taskForm.assignedToId} onChange={(e) => setTaskForm({ ...taskForm, assignedToId: e.target.value })}>
                <option value="">Unassigned</option>
                {assignees.map((a) => (
                  <option key={a.id} value={a.id}>{a.name} — {a.role.replaceAll("_", " ")}</option>
                ))}
              </select>
            </Label>
            <Label className="text-base text-slate-600">
              Priority
              <select className="min-h-12 w-full rounded-md border border-slate-300 bg-white px-3 py-3 text-base" value={taskForm.priority} onChange={(e) => setTaskForm({ ...taskForm, priority: e.target.value })}>
                {PRIORITIES.map((p) => (<option key={p} value={p}>{p}</option>))}
              </select>
            </Label>
            <Label className="text-base text-slate-600">
              Status
              <select className="min-h-12 w-full rounded-md border border-slate-300 bg-white px-3 py-3 text-base" value={taskForm.status} onChange={(e) => setTaskForm({ ...taskForm, status: e.target.value })}>
                {TASK_STATUSES.map((s) => (<option key={s} value={s}>{s.replaceAll("_", " ")}</option>))}
              </select>
            </Label>
            <Label className="text-base text-slate-600">
              Progress (%)
              <Input type="number" min="0" max="100" value={taskForm.progress} onChange={(e) => setTaskForm({ ...taskForm, progress: e.target.value })} />
            </Label>
            <Label className="text-base text-slate-600">
              Start date
              <Input type="date" value={taskForm.startDate} onChange={(e) => setTaskForm({ ...taskForm, startDate: e.target.value })} />
            </Label>
            <Label className="text-base text-slate-600">
              Deadline
              <Input type="date" value={taskForm.deadline} onChange={(e) => setTaskForm({ ...taskForm, deadline: e.target.value })} />
            </Label>
            <Label className="text-base text-slate-600 sm:col-span-2">
              Description
              <Textarea rows={2} value={taskForm.description} onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })} />
            </Label>
          </div>
          <div className="mt-4 flex gap-2">
            <Button variant="default" type="submit">{editingTaskId ? "Save changes" : "Create task"}</Button>
            {editingTaskId && <Button variant="outline" type="button" onClick={() => { setEditingTaskId(null); setTaskForm(emptyTask); }}>Cancel</Button>}
          </div>
        </form>
      )}

      <h2 className="mt-8 text-lg font-semibold text-slate-900">Tasks ({tasks.length})</h2>
      {tasks.length === 0 && (
        <p className="mt-2 rounded-lg border border-dashed border-slate-300 bg-white p-6 text-base text-slate-500">
          No tasks yet for this project.
        </p>
      )}
      <div className="mt-3 grid gap-4">
        {tasks.map((task) => {
          const isAssignee = task.assignedTo?.id === meId;
          const canEdit = canManageTasks || isAssignee;
          return (
            <article key={task.id} className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-base font-semibold text-slate-900">{task.title}</p>
                  <p className="text-base text-slate-500">
                    {task.status.replaceAll("_", " ")} · {task.priority} · {task.progress}%
                    {task.assignedTo ? ` · ${task.assignedTo.name}` : " · Unassigned"}
                    {task.deadline ? ` · Due ${task.deadline.slice(0, 10)}` : ""}
                  </p>
                  {task.description && <p className="mt-1 text-base text-slate-700">{task.description}</p>}
                  <div className="mt-2 h-2 w-48 rounded-full bg-slate-200">
                    <div className="h-2 rounded-full bg-brand-600" style={{ width: `${task.progress}%` }} />
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {canEdit && (
                    <>
                      <select
                        className="min-h-12 rounded-md border border-slate-300 bg-white px-2 py-1 text-base"
                        value={task.status}
                        onChange={(e) => quickUpdate(task, { status: e.target.value })}
                      >
                        {TASK_STATUSES.map((s) => (<option key={s} value={s}>{s.replaceAll("_", " ")}</option>))}
                      </select>
                      <Button variant="outline" onClick={() => startEditTask(task)}>Edit</Button>
                    </>
                  )}
                  {isManagerOrAdmin && <Button variant="outline" onClick={() => handleDeleteTask(task)}>Delete</Button>}
                  <Button variant="outline" onClick={() => toggleComments(task.id)}>
                    Comments ({comments[task.id]?.length ?? task._count.comments})
                  </Button>
                </div>
              </div>
              {openComments[task.id] && (
                <div className="mt-3 border-t border-slate-100 pt-3">
                  {(comments[task.id] ?? []).map((c) => (
                    <p key={c.id} className="mt-1 text-base text-slate-700">
                      <span className="font-medium">{c.author?.name ?? "Former member"}:</span> {c.body}
                      <span className="ml-2 text-sm text-slate-400">{new Date(c.createdAt).toLocaleString()}</span>
                    </p>
                  ))}
                  {(comments[task.id] ?? []).length === 0 && (
                    <p className="text-base text-slate-400">No comments yet.</p>
                  )}
                  <div className="mt-2 flex gap-2">
                    <Input
                     
                      placeholder="Add a progress note…"
                      value={commentDraft[task.id] ?? ""}
                      onChange={(e) => setCommentDraft((d) => ({ ...d, [task.id]: e.target.value }))}
                    />
                    <Button variant="default" type="button" onClick={() => handleComment(task.id)}>Add</Button>
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
