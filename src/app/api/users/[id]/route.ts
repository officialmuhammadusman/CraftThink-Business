import { NextResponse } from "next/server";
import { requireAuth, isSuperAdmin } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { userPatchSchema } from "@/lib/validation";
import { prisma } from "@/lib/prisma";
import {
  forbidden,
  handleRoute,
  jsonError,
  jsonOk,
  notFound,
  unauthorized,
} from "@/lib/api";

const PUBLIC_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  active: true,
  createdAt: true,
  updatedAt: true,
  permissionGrants: { select: { module: true, level: true } },
} as const;

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  return handleRoute(async () => {
    const user = await requireAuth();
    if (!user) return unauthorized();
    // Only the Super Admin changes roles or (de)activates members.
    if (!isSuperAdmin(user)) return forbidden("Only the Super Admin manages the team");
    const target = await prisma.user.findUnique({
      where: { id: params.id },
      select: PUBLIC_SELECT,
    });
    if (!target) return notFound("User not found");
    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return jsonError("Request body must be valid JSON", 400);
    }
    const parsed = userPatchSchema.safeParse(body);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return jsonError(
        first ? `${first.path.join(".") || "body"}: ${first.message}` : "Invalid body",
        422,
      );
    }
    // No member may be promoted to SUPER_ADMIN or ADMIN.
    if (parsed.data.role === "SUPER_ADMIN" || parsed.data.role === "ADMIN") {
      return forbidden("Members cannot be given Super Admin or Admin roles");
    }
    // Safety rails: never deactivate your own account, and never remove
    // the last active Super Admin (by role change or deactivation).
    if (params.id === user.id && parsed.data.active === false) {
      return jsonError("You cannot deactivate your own account", 409);
    }
    const demotingSuperAdmin =
      target.role === "SUPER_ADMIN" &&
      (parsed.data.role !== undefined || parsed.data.active === false);
    if (demotingSuperAdmin) {
      const others = await prisma.user.count({
        where: { role: "SUPER_ADMIN", active: true, id: { not: target.id } },
      });
      if (others === 0) {
        return jsonError("Cannot remove the last active Super Admin", 409);
      }
    }
    const updated = await prisma.user.update({
      where: { id: target.id },
      data: {
        ...(parsed.data.role ? { role: parsed.data.role } : {}),
        ...(parsed.data.active !== undefined ? { active: parsed.data.active } : {}),
      },
      select: PUBLIC_SELECT,
    });
    await writeAudit(user.id, "USER_UPDATED", "User", updated.id, {
      email: updated.email,
      role: updated.role,
      active: updated.active,
    });
    return jsonOk(updated);
  });
}
