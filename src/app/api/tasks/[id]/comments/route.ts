import { NextResponse } from "next/server";
import { moduleAccess } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { taskCommentSchema } from "@/lib/validation";
import { prisma } from "@/lib/prisma";
import {
  handleRoute,
  forbidden,
  jsonOk,
  notFound,
  parseBody,
  unauthorized,
} from "@/lib/api";
import { taskScopeForLevel } from "../../../companies/_scope";
import type { PermLevel } from "@/lib/rbac";

async function visibleTask(user: { id: string }, id: string, level: PermLevel) {
  const task = await prisma.task.findFirst({
    where: { id, AND: [taskScopeForLevel(user as never, level) as never] },
    select: { id: true, projectId: true, title: true },
  });
  if (task) return task;
  const exists = await prisma.task.findUnique({ where: { id }, select: { id: true } });
  return exists ? ("forbidden" as const) : null;
}

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  return handleRoute(async () => {
    const access = await moduleAccess("TASKS");
    if (!access.ok) return access.reason === "unauthenticated" ? unauthorized() : forbidden();
    const user = access.user;
    const level = access.level;
    const task = await visibleTask(user, params.id, level);
    if (task === "forbidden") return forbidden();
    if (!task) return notFound("Task not found");
    const items = await prisma.taskComment.findMany({
      where: { taskId: task.id },
      include: { author: { select: { id: true, name: true } } },
      orderBy: { createdAt: "asc" },
    });
    return jsonOk({ items });
  });
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  return handleRoute(async () => {
    const access = await moduleAccess("TASKS");
    if (!access.ok) return access.reason === "unauthenticated" ? unauthorized() : forbidden();
    const user = access.user;
    const level = access.level;
    const task = await visibleTask(user, params.id, level);
    if (task === "forbidden") return forbidden();
    if (!task) return notFound("Task not found");
    const parsed = await parseBody(request, taskCommentSchema);
    if ("error" in parsed) return parsed.error;
    const item = await prisma.taskComment.create({
      data: {
        taskId: task.id,
        authorId: user.id,
        body: parsed.data.body.trim(),
      },
      include: { author: { select: { id: true, name: true } } },
    });
    await writeAudit(user.id, "TASK_COMMENT_ADDED", "Task", task.id, {
      projectId: task.projectId,
      commentId: item.id,
    });
    return jsonOk(item, 201);
  });
}
