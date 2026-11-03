import { NextResponse } from "next/server";
import { moduleAccess } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { forbidden, handleRoute, jsonOk, unauthorized } from "@/lib/api";
import { companyScopeForLevel } from "../_scope";

/** All tags, with counts scoped to companies the caller may see. */
export async function GET(): Promise<NextResponse> {
  return handleRoute(async () => {
    const access = await moduleAccess("COMPANIES");
    if (!access.ok) return access.reason === "unauthenticated" ? unauthorized() : forbidden();
    const user = access.user;
    const level = access.level;
    const [tags, visible] = await Promise.all([
      prisma.tag.findMany({ orderBy: { name: "asc" } }),
      prisma.company.findMany({
        where: companyScopeForLevel(user, level),
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
