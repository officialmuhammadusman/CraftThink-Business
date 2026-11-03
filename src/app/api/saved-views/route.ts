import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { savedViewSchema } from "@/lib/validation";
import { prisma } from "@/lib/prisma";
import {
  handleRoute,
  jsonOk,
  parseBody,
  unauthorized,
} from "@/lib/api";
import { writeAudit } from "@/lib/audit";

/**
 * Saved filter views (personal, per user, per module "companies"|"deals").
 *
 * A view stores ONLY filter values (query params). It never stores data
 * and never widens access: list routes always AND the caller's
 * PermissionGrant scope with the view's filters, so applying someone
 * else's filter values could still only ever narrow the caller's own
 * scoped list. Views themselves are strictly per-user: a user can
 * list/create only their own, and DELETE verifies ownership.
 */
export async function GET(request: Request): Promise<NextResponse> {
  return handleRoute(async () => {
    const user = await getSessionUser();
    if (!user) return unauthorized();
    const moduleParam = new URL(request.url).searchParams.get("module") ?? "";
    const items = await prisma.savedView.findMany({
      where: {
        userId: user.id,
        ...(moduleParam === "companies" || moduleParam === "deals"
          ? { module: moduleParam }
          : {}),
      },
      orderBy: { updatedAt: "desc" },
    });
    return jsonOk({ items });
  });
}

export async function POST(request: Request): Promise<NextResponse> {
  return handleRoute(async () => {
    const user = await getSessionUser();
    if (!user) return unauthorized();
    const parsed = await parseBody(request, savedViewSchema);
    if ("error" in parsed) return parsed.error;
    const data = parsed.data;
    const item = await prisma.savedView.create({
      data: {
        userId: user.id,
        module: data.module,
        name: data.name.trim(),
        filters: data.filters ?? {},
      },
    });
    await writeAudit(user.id, "SAVED_VIEW_CREATED", "SavedView", item.id, {
      module: item.module,
      name: item.name,
    });
    return jsonOk(item, 201);
  });
}
