import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/rbac";
import { hashPassword, verifyPassword } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { changePasswordSchema } from "@/lib/validation";
import { prisma } from "@/lib/prisma";
import {
  handleRoute,
  jsonError,
  jsonOk,
  parseBody,
  unauthorized,
} from "@/lib/api";

export async function POST(request: Request): Promise<NextResponse> {
  return handleRoute(async () => {
    const user = await requireAuth();
    if (!user) return unauthorized();
    const parsed = await parseBody(request, changePasswordSchema);
    if ("error" in parsed) return parsed.error;
    const record = await prisma.user.findUnique({
      where: { id: user.id },
      select: { id: true, passwordHash: true },
    });
    if (!record) return unauthorized();
    const valid = await verifyPassword(
      parsed.data.currentPassword,
      record.passwordHash,
    );
    if (!valid) return jsonError("Current password is incorrect", 403);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(parsed.data.newPassword) },
    });
    await writeAudit(user.id, "PASSWORD_CHANGED", "User", user.id, {});
    return jsonOk({ changed: true });
  });
}
