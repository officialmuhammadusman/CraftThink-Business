import { NextResponse } from "next/server";
import { requireAuth, isSuperAdmin, getPermissionMap } from "@/lib/rbac";
import { permissionGrantSchema } from "@/lib/validation";
import { writeAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import {
  forbidden,
  handleRoute,
  jsonError,
  jsonOk,
  notFound,
  parseBody,
  unauthorized,
} from "@/lib/api";

/**
 * Per-member permission grants. SUPER_ADMIN ONLY (both read and write).
 * GET returns the member's effective level for every module (a Super
 * Admin target always reports ALL, since grants never apply to them).
 * PUT upserts one PermissionGrant row { userId, module, level }.
 * A Super Admin target cannot receive grants (they already bypass
 * everything), so PUT for such a target is rejected with 409.
 */
export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  return handleRoute(async () => {
    const user = await requireAuth();
    if (!user) return unauthorized();
    if (!isSuperAdmin(user))
      return forbidden("Only the Super Admin manages permissions");
    const target = await prisma.user.findUnique({
      where: { id: params.id },
      select: { id: true, name: true, email: true, role: true },
    });
    if (!target) return notFound("User not found");
    const permissions = await getPermissionMap(target.id);
    return jsonOk({ user: target, permissions });
  });
}

export async function PUT(
  request: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  return handleRoute(async () => {
    const user = await requireAuth();
    if (!user) return unauthorized();
    if (!isSuperAdmin(user))
      return forbidden("Only the Super Admin manages permissions");
    const parsed = await parseBody(request, permissionGrantSchema);
    if ("error" in parsed) return parsed.error;
    const { userId, module, level } = parsed.data;
    if (userId !== params.id) {
      return jsonError("userId must match the user in the URL", 400);
    }
    const target = await prisma.user.findUnique({
      where: { id: params.id },
      select: { id: true, name: true, email: true, role: true },
    });
    if (!target) return notFound("User not found");
    if (target.role === "SUPER_ADMIN") {
      return jsonError(
        "The Super Admin already has full access; grants do not apply",
        409,
      );
    }
    const grant = await prisma.permissionGrant.upsert({
      where: { userId_module: { userId: target.id, module } },
      update: { level },
      create: { userId: target.id, module, level },
    });
    await writeAudit(user.id, "PERMISSION_GRANTED", "PermissionGrant", grant.id, {
      targetUserId: target.id,
      targetEmail: target.email,
      module,
      level,
    });
    return jsonOk(grant);
  });
}
