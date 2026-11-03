import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { followUpSchema } from "@/lib/validation";
import { prisma } from "@/lib/prisma";
import {
  forbidden,
  handleRoute,
  jsonError,
  jsonOk,
  notFound,
  unauthorized,
} from "@/lib/api";
import { canEditLinked, isPrivileged, linkedScope, pickPresent } from "../../companies/_scope";

const patchSchema = followUpSchema.omit({ companyId: true }).partial();

const INCLUDE = {
  company: { select: { id: true, name: true } },
  contact: { select: { id: true, fullName: true } },
  assignedTo: { select: { id: true, name: true, email: true } },
} as const;

async function visible(user: { id: string; role: string }, id: string) {
  return prisma.followUp.findFirst({
    where: { id, AND: [linkedScope(user as never) as never] },
    include: INCLUDE,
  });
}

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  return handleRoute(async () => {
    const user = await requireAuth();
    if (!user) return unauthorized();
    const item = await visible(user, params.id);
    if (!item) return notFound("Follow-up not found");
    return jsonOk(item);
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  return handleRoute(async () => {
    const user = await requireAuth();
    if (!user) return unauthorized();
    const item = await visible(user, params.id);
    if (!item) return notFound("Follow-up not found");
    if (!canEditLinked(user, item))
      return forbidden("You cannot edit this follow-up");
    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return jsonError("Request body must be valid JSON", 400);
    }
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return jsonError(
        first ? `${first.path.join(".") || "body"}: ${first.message}` : "Invalid body",
        422,
      );
    }
    const data = pickPresent(body, parsed.data);
    const clean: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      clean[key] = typeof value === "string" ? value.trim() || null : value;
    }
    const updated = await prisma.followUp.update({
      where: { id: item.id },
      data: clean,
      include: INCLUDE,
    });
    await writeAudit(user.id, "FOLLOWUP_UPDATED", "FollowUp", updated.id, {
      companyId: updated.companyId,
      status: updated.status,
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
    const item = await visible(user, params.id);
    if (!item) return notFound("Follow-up not found");
    if (!isPrivileged(user) && !canEditLinked(user, item)) {
      return forbidden("You cannot delete this follow-up");
    }
    await prisma.followUp.delete({ where: { id: item.id } });
    await writeAudit(user.id, "FOLLOWUP_DELETED", "FollowUp", item.id, {
      companyId: item.companyId,
    });
    return jsonOk({ deleted: true });
  });
}
