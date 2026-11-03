import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { taskSchema } from "@/lib/validation";
import { prisma } from "@/lib/prisma";
import {
  forbidden,
  handleRoute,
  jsonOk,
  notFound,
  parseBody,
  unauthorized,
} from "@/lib/api";
import {
  canManageProject,
  isPrivileged,
  paginationMeta,
  parsePagination,
  projectScope,
  taskScope,
} from "../../../companies/_scope";
import { TASK_INCLUDE } from "../../../_includes";

export async function GET(
  request: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  return handleRoute(async () => {
    const user = await requireAuth();
    if (!user) return unauthorized();
    const project = await prisma.project.findFirst({
      where: { id: params.id, AND: [projectScope(user as never) as never] },
      select: { id: true },
    });
    if (!project) return notFound("Project not found");
    const { page, limit, skip } = parsePagination(request);
    const status = new URL(request.url).searchParams.get("status") ?? "";
    const where = { projectId: project.id, ...(status ? { status } : {}) };
    const [items, total] = await Promise.all([
      prisma.task.findMany({
        where: { ...where, AND: [taskScope(user as never) as never] } as never,
        include: TASK_INCLUDE,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.task.count({
        where: { ...where, AND: [taskScope(user as never) as never] } as never,
      }),
    ]);
    return jsonOk({ items, pagination: paginationMeta(total, page, limit) });
  });
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  return handleRoute(async () => {
    const user = await requireAuth();
    if (!user) return unauthorized();
    const project = await prisma.project.findFirst({
      where: { id: params.id, AND: [projectScope(user as never) as never] },
      include: {
        manager: { select: { id: true } },
        developers: { select: { id: true } },
      },
    });
    if (!project) return notFound("Project not found");
    const mayCreate =
      isPrivileged(user) ||
      project.manager?.id === user.id ||
      project.developers.some((d) => d.id === user.id);
    if (!mayCreate)
      return forbidden("Only admins, the project manager or project developers create tasks");
    const parsed = await parseBody(request, taskSchema);
    if ("error" in parsed) return parsed.error;
    const data = parsed.data;
    if (data.assignedToId) {
      const assignee = await prisma.user.findFirst({
        where: { id: data.assignedToId, active: true },
        select: { id: true },
      });
      if (!assignee) return notFound("Assigned user not found");
    }
    const item = await prisma.task.create({
      data: {
        projectId: project.id,
        title: data.title.trim(),
        description: data.description?.trim() || null,
        assignedToId: data.assignedToId || null,
        priority: data.priority,
        startDate: data.startDate ?? null,
        deadline: data.deadline ?? null,
        status: data.status,
        progress: data.progress ?? 0,
      },
      include: TASK_INCLUDE,
    });
    await writeAudit(user.id, "TASK_CREATED", "Task", item.id, {
      projectId: project.id,
      title: item.title,
      status: item.status,
    });
    return jsonOk(item, 201);
  });
}
