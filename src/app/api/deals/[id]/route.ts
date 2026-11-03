import { NextResponse } from "next/server";
import { moduleAccess } from "@/lib/rbac";
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
import { canEditLinked, dealScopeForLevel, pickPresent } from "../../companies/_scope";
import type { PermLevel } from "@/lib/rbac";
import { DEAL_INCLUDE } from "../_include";

const patchSchema = dealSchema.omit({ companyId: true }).partial();

async function visible(user: { id: string }, id: string, level: PermLevel) {
  const item = await prisma.deal.findFirst({
    where: { id, AND: [dealScopeForLevel(user as never, level) as never] },
    include: DEAL_INCLUDE,
  });
  if (item) return item;
  const exists = await prisma.deal.findUnique({ where: { id }, select: { id: true } });
  return exists ? ("forbidden" as const) : null;
}

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  return handleRoute(async () => {
    const access = await moduleAccess("DEALS");
    if (!access.ok) return access.reason === "unauthenticated" ? unauthorized() : forbidden();
    const user = access.user;
    const level = access.level;
    const item = await visible(user, params.id, level);
    if (item === "forbidden") return forbidden();
    if (!item) return notFound("Deal not found");
    return jsonOk(item);
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  return handleRoute(async () => {
    const access = await moduleAccess("DEALS");
    if (!access.ok) return access.reason === "unauthenticated" ? unauthorized() : forbidden();
    const user = access.user;
    const level = access.level;
    const item = await visible(user, params.id, level);
    if (item === "forbidden") return forbidden("You cannot edit this deal");
    if (!item) return notFound("Deal not found");
    if (level !== "ALL" && !canEditLinked(user, item))
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
    // Reopening a Won/Lost deal requires full deal access.
    if (
      (item.status === "WON" || item.status === "LOST") &&
      nextStatus !== item.status &&
      nextStatus !== "WON" &&
      nextStatus !== "LOST" &&
      level !== "ALL"
    ) {
      return forbidden("Only users with full deal access reopen Won or Lost deals");
    }
    if (level === "ASSIGNED" && "assignedToId" in data && data.assignedToId !== null && data.assignedToId !== user.id) {
      return forbidden("You may not reassign this deal to someone else");
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
    const access = await moduleAccess("DEALS");
    if (!access.ok) return access.reason === "unauthenticated" ? unauthorized() : forbidden();
    const user = access.user;
    const level = access.level;
    const item = await visible(user, params.id, level);
    if (item === "forbidden") return forbidden("You cannot delete this deal");
    if (!item) return notFound("Deal not found");
    if (level !== "ALL")
      return forbidden("Only users with full deal access delete deals");
    await prisma.deal.delete({ where: { id: item.id } });
    await writeAudit(user.id, "DEAL_DELETED", "Deal", item.id, {
      companyId: item.companyId,
      title: item.title,
    });
    return jsonOk({ deleted: true });
  });
}
