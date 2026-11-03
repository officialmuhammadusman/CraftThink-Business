import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/rbac";
import {
  handleRoute,
  jsonOk,
  parseBody,
  unauthorized,
  forbidden,
  notFound,
} from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import {
  isAdmin,
  isSuperAdmin,
  suppressionSchema,
} from "@/app/api/emails/shared";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  return handleRoute(async () => {
    const user = await requireAuth();
    if (!user) return unauthorized();
    const row = await prisma.suppression.findUnique({
      where: { id: params.id },
    });
    if (!row) return notFound("Suppression entry not found");
    return jsonOk(row);
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  return handleRoute(async () => {
    const user = await requireAuth();
    if (!user) return unauthorized();
    if (!isAdmin(user)) return forbidden();
    const parsed = await parseBody(
      request,
      suppressionSchema.omit({ email: true }).partial(),
    );
    if ("error" in parsed) return parsed.error;

    const existing = await prisma.suppression.findUnique({
      where: { id: params.id },
    });
    if (!existing) return notFound("Suppression entry not found");

    const data: Record<string, unknown> = {};
    if (parsed.data.reason !== undefined)
      data.reason = parsed.data.reason ?? null;
    if (parsed.data.scope !== undefined) data.scope = parsed.data.scope;

    const updated = await prisma.suppression.update({
      where: { id: params.id },
      data: { ...data },
    });
    await writeAudit(user.id, "SUPPRESSION_UPDATED", "Suppression", updated.id, {
      email: updated.email,
    });
    return jsonOk(updated);
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  return handleRoute(async () => {
    const user = await requireAuth();
    if (!user) return unauthorized();
    // RBAC matrix: removal is Super-Admin-only. A mistaken removal
    // re-exposes someone who asked to stop — the highest-risk undo.
    if (!isSuperAdmin(user)) return forbidden();
    const existing = await prisma.suppression.findUnique({
      where: { id: params.id },
    });
    if (!existing) return notFound("Suppression entry not found");

    await prisma.suppression.delete({ where: { id: params.id } });
    await writeAudit(user.id, "SUPPRESSION_REMOVED", "Suppression", params.id, {
      email: existing.email,
    });
    return jsonOk({ deleted: true });
  });
}
