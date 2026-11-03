import { NextResponse } from "next/server";
import { moduleAccess } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { forbidden, handleRoute, jsonOk, unauthorized } from "@/lib/api";
import {
  activityScopeForLevel,
  paginationMeta,
  parsePagination,
} from "../companies/_scope";

/** Activity log, newest first. Admins filter by actor/entity; others see only their own actions. */
export async function GET(request: Request): Promise<NextResponse> {
  return handleRoute(async () => {
    const access = await moduleAccess("ACTIVITY_LOG");
    if (!access.ok) return access.reason === "unauthenticated" ? unauthorized() : forbidden();
    const user = access.user;
    const level = access.level;
    const params = new URL(request.url).searchParams;
    const { page, limit, skip } = parsePagination(request);
    const entityType = (params.get("entityType") ?? "").trim();
    const actorId = (params.get("actorId") ?? "").trim();
    const search = (params.get("search") ?? "").trim();

    const and: Record<string, unknown>[] = [activityScopeForLevel(user, level)];
    if (entityType) and.push({ entityType });
    // ASSIGNED callers are already forced to their own actorId by the
    // scope; only ALL callers may filter by another actor.
    if (actorId && level === "ALL") and.push({ actorId });
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
