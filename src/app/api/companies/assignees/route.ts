import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { handleRoute, jsonOk, unauthorized } from "@/lib/api";
import { isPrivileged } from "../_scope";

/**
 * Active users for assignee dropdowns. Admins see everyone; everyone else
 * sees only themselves (they may only assign records to themselves).
 */
export async function GET(): Promise<NextResponse> {
  return handleRoute(async () => {
    const user = await requireAuth();
    if (!user) return unauthorized();
    const users = await prisma.user.findMany({
      where: isPrivileged(user) ? { active: true } : { id: user.id },
      select: { id: true, name: true, email: true, role: true },
      orderBy: { name: "asc" },
    });
    return jsonOk({ items: users });
  });
}
