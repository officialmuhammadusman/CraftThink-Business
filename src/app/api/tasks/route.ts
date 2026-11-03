import { NextResponse } from "next/server";
import { moduleAccess } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { forbidden, handleRoute, jsonOk, unauthorized } from "@/lib/api";
import {
  paginationMeta,
  parsePagination,
  taskScopeForLevel,
} from "../companies/_scope";
import { TASK_INCLUDE } from "../_includes";

export async function GET(request: Request): Promise<NextResponse> {
  return handleRoute(async () => {
    const access = await moduleAccess("TASKS");
    if (!access.ok) return access.reason === "unauthenticated" ? unauthorized() : forbidden();
    const user = access.user;
    const level = access.level;
    const params = new URL(request.url).searchParams;
    const { page, limit, skip } = parsePagination(request);
    const status = (params.get("status") ?? "").trim();
    const projectId = (params.get("projectId") ?? "").trim();
    const assignedTo = (params.get("assignedTo") ?? "").trim();
    const and: Record<string, unknown>[] = [taskScopeForLevel(user, level)];
    if (status) and.push({ status });
    if (projectId) and.push({ projectId });
    if (assignedTo) and.push({ assignedToId: assignedTo });
    const where = { AND: and };
    const [items, total] = await Promise.all([
      prisma.task.findMany({
        where: where as never,
        include: TASK_INCLUDE,
        orderBy: { updatedAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.task.count({ where: where as never }),
    ]);
    return jsonOk({ items, pagination: paginationMeta(total, page, limit) });
  });
}
