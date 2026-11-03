import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { taskCommentSchema } from "@/lib/validation";
import { prisma } from "@/lib/prisma";
import {
  handleRoute,
  jsonOk,
  notFound,
  parseBody,
  unauthorized,
} from "@/lib/api";
import { taskScope } from "../../../companies/_scope";

async function visibleTask(user: { id: string; role: string }, id: string) {
  return prisma.task.findFirst({
    where: { id, AND: [taskScope(user as never) as never] },
    select: { id: true, projectId: true, title: true },
  });
}

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  return handleRoute(async () => {
    const user = await requireAuth();
    if (!user) return unauthorized();
    const task = await visibleTask(user, params.id);
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
    const user = await requireAuth();
    if (!user) return unauthorized();
    const task = await visibleTask(user, params.id);
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
