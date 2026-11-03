import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { taskSchema } from "@/lib/validation";
import { prisma } from "@/lib/prisma";
import {
  forbidden,
  handleRoute,
  jsonError,
  jsonOk,
  notFound,
  unauthorized,
} from "@/lib/api";
import {
  canManageTask,
  isPrivileged,
  pickPresent,
  taskScope,
} from "../../companies/_scope";
import { TASK_INCLUDE } from "../../_includes";

const patchSchema = taskSchema.omit({ projectId: true }).partial();

async function visible(user: { id: string; role: string }, id: string) {
  return prisma.task.findFirst({
    where: { id, AND: [taskScope(user as never) as never] },
    include: {
      ...TASK_INCLUDE,
      project: {
        select: {
          id: true,
          name: true,
          managerId: true,
          developers: { select: { id: true } },
        },
      },
      comments: {
        include: { author: { select: { id: true, name: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });
}

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  return handleRoute(async () => {
    const user = await requireAuth();
    if (!user) return unauthorized();
    const item = await visible(user, params.id);
    if (!item) return notFound("Task not found");
    return jsonOk(item);
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  return handleRoute(async () => {
    const user = await requireAuth();
    if (!user) return unauthorized();
    const item = await visible(user, params.id);
    if (!item) return notFound("Task not found");
    const fullManager = canManageTask(user, item);
    const isAssignee = item.assignedToId === user.id;
    // The assignee may update only their own status/progress; full edits
    // need a manager/admin/developer-on-project. Anyone else is blocked.
    if (!fullManager && !isAssignee)
      return forbidden("You cannot edit this task");
    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return jsonError("Request body must be valid JSON", 400);
    }
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return jsonError(
        first ? `${first.path.join(".") || "body"}: ${first.message}` : "Invalid body",
        422,
      );
    }
    const data = pickPresent(body, parsed.data);
    if (!fullManager) {
      // Assignee-only update: keep only status/progress.
      const limited: { status?: unknown; progress?: unknown } = {};
      if ("status" in data) limited.status = data.status;
      if ("progress" in data) limited.progress = data.progress;
      const cleanLimited: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(limited)) cleanLimited[key] = value;
      const updatedLimited = await prisma.task.update({
        where: { id: item.id },
        data: cleanLimited as never,
        include: TASK_INCLUDE,
      });
      await writeAudit(user.id, "TASK_UPDATED", "Task", updatedLimited.id, {
        projectId: updatedLimited.projectId,
        status: updatedLimited.status,
        progress: updatedLimited.progress,
      });
      return jsonOk(updatedLimited);
    }
    const clean: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      clean[key] = typeof value === "string" ? value.trim() || null : value;
    }
    if (typeof clean.title === "string") clean.title = (clean.title as string).trim();
    if (clean.assignedToId) {
      const assignee = await prisma.user.findFirst({
        where: { id: clean.assignedToId as string, active: true },
        select: { id: true },
      });
      if (!assignee) return notFound("Assigned user not found");
    }
    const updated = await prisma.task.update({
      where: { id: item.id },
      data: clean,
      include: TASK_INCLUDE,
    });
    await writeAudit(user.id, "TASK_UPDATED", "Task", updated.id, {
      projectId: updated.projectId,
      status: updated.status,
      progress: updated.progress,
    });
    return jsonOk(updated);
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  return handleRoute(async () => {
    const user = await requireAuth();
    if (!user) return unauthorized();
    const item = await visible(user, params.id);
    if (!item) return notFound("Task not found");
    if (!canManageTask(user, item) && !isPrivileged(user))
      return forbidden("You cannot delete this task");
    await prisma.task.delete({ where: { id: item.id } });
    await writeAudit(user.id, "TASK_DELETED", "Task", item.id, {
      projectId: item.projectId,
      title: item.title,
    });
    return jsonOk({ deleted: true });
  });
}
