import { NextResponse } from "next/server";
import { moduleAccess } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { forbidden, handleRoute, jsonOk, unauthorized } from "@/lib/api";

/**
 * Active users for assignee dropdowns. Admins see everyone; everyone else
 * sees only themselves (they may only assign records to themselves).
 */
export async function GET(): Promise<NextResponse> {
  return handleRoute(async () => {
    const access = await moduleAccess("COMPANIES");
    if (!access.ok) return access.reason === "unauthenticated" ? unauthorized() : forbidden();
    const user = access.user;
    const level = access.level;
    const users = await prisma.user.findMany({
      where: level === "ALL" ? { active: true } : { id: user.id },
      select: { id: true, name: true, email: true, role: true },
      orderBy: { name: "asc" },
    });
    return jsonOk({ items: users });
  });
}
