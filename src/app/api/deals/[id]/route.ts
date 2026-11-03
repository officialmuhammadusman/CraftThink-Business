import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { dealSchema } from "@/lib/validation";
import { prisma } from "@/lib/prisma";
import {
  forbidden,
  handleRoute,
  jsonError,
  jsonOk,
  notFound,
  unauthorized,
} from "@/lib/api";
import { canEditLinked, dealScope, isPrivileged, pickPresent } from "../../companies/_scope";
import { DEAL_INCLUDE } from "../route";

const patchSchema = dealSchema.omit({ companyId: true }).partial();

async function visible(user: { id: string; role: string }, id: string) {
  return prisma.deal.findFirst({
    where: { id, AND: [dealScope(user as never) as never] },
    include: DEAL_INCLUDE,
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
    if (!item) return notFound("Deal not found");
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
    if (!item) return notFound("Deal not found");
    if (!canEditLinked(user, item))
      return forbidden("You cannot edit this deal");
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
    const nextStatus = (data.status as string | undefined) ?? item.status;
    const nextNotes =
      "notes" in data
        ? ((data.notes as string | null) ?? "")
        : (item.notes ?? "");
    if (nextStatus === "LOST" && !nextNotes.trim()) {
      return jsonError("A lost deal requires a reason note", 422);
    }
    // Reopening a Won/Lost deal is Admin-only (RBAC matrix).
    if (
      (item.status === "WON" || item.status === "LOST") &&
      nextStatus !== item.status &&
      nextStatus !== "WON" &&
      nextStatus !== "LOST" &&
      !isPrivileged(user)
    ) {
      return forbidden("Only Admin / Super Admin reopen Won or Lost deals");
    }
    const clean: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      clean[key] = typeof value === "string" ? value.trim() || null : value;
    }
    if (typeof clean.title === "string") clean.title = (clean.title as string).trim();
    const updated = await prisma.deal.update({
      where: { id: item.id },
      data: clean,
      include: DEAL_INCLUDE,
    });
    await writeAudit(user.id, "DEAL_UPDATED", "Deal", updated.id, {
      companyId: updated.companyId,
      status: updated.status,
      ...(nextStatus !== item.status
        ? { stageFrom: item.status, stageTo: nextStatus }
        : {}),
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
    if (!item) return notFound("Deal not found");
    if (!isPrivileged(user))
      return forbidden("Only Admin / Super Admin delete deals");
    await prisma.deal.delete({ where: { id: item.id } });
    await writeAudit(user.id, "DEAL_DELETED", "Deal", item.id, {
      companyId: item.companyId,
      title: item.title,
    });
    return jsonOk({ deleted: true });
  });
}
