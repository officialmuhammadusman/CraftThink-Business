import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { handleRoute, jsonOk, unauthorized } from "@/lib/api";
import {
  activityScope,
  isPrivileged,
  paginationMeta,
  parsePagination,
} from "../companies/_scope";

/** Activity log, newest first. Admins filter by actor/entity; others see only their own actions. */
export async function GET(request: Request): Promise<NextResponse> {
  return handleRoute(async () => {
    const user = await requireAuth();
    if (!user) return unauthorized();
    const params = new URL(request.url).searchParams;
    const { page, limit, skip } = parsePagination(request);
    const entityType = (params.get("entityType") ?? "").trim();
    const actorId = (params.get("actorId") ?? "").trim();
    const search = (params.get("search") ?? "").trim();

    const and: Record<string, unknown>[] = [activityScope(user)];
    if (entityType) and.push({ entityType });
    // Non-admins are already forced to their own actorId by activityScope;
    // honouring their actorId param could only narrow to themselves.
    if (actorId && isPrivileged(user)) and.push({ actorId });
    if (search) and.push({ action: { contains: search, mode: "insensitive" } });
    const where = { AND: and };
    const [items, total] = await Promise.all([
      prisma.activityLog.findMany({
        where: where as never,
        include: { actor: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.activityLog.count({ where: where as never }),
    ]);
    return jsonOk({ items, pagination: paginationMeta(total, page, limit) });
  });
}
