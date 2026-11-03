import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { handleRoute, jsonOk, unauthorized } from "@/lib/api";
import { companyScope } from "../_scope";

/** All tags, with counts scoped to companies the caller may see. */
export async function GET(): Promise<NextResponse> {
  return handleRoute(async () => {
    const user = await requireAuth();
    if (!user) return unauthorized();
    const [tags, visible] = await Promise.all([
      prisma.tag.findMany({ orderBy: { name: "asc" } }),
      prisma.company.findMany({
        where: companyScope(user),
        select: { tags: { select: { id: true } } },
      }),
    ]);
    const counts = new Map<string, number>();
    for (const company of visible) {
      for (const tag of company.tags) {
        counts.set(tag.id, (counts.get(tag.id) ?? 0) + 1);
      }
    }
    return jsonOk({
      items: tags.map((t) => ({
        id: t.id,
        name: t.name,
        companyCount: counts.get(t.id) ?? 0,
      })),
    });
  });
}
