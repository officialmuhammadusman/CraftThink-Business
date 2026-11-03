import { NextResponse } from "next/server";
import { z } from "zod";
import { moduleAccess } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import {
  forbidden,
  handleRoute,
  jsonError,
  jsonOk,
  notFound,
  unauthorized,
} from "@/lib/api";
import { canEditLinked, dealScopeForLevel } from "../../../companies/_scope";
import { DEAL_INCLUDE } from "../../_include";
import { stageExitError } from "@/lib/deal-stages";

const moveSchema = z.object({
  status: z.enum([
    "NEW_LEAD",
    "CONTACTED",
    "FOLLOW_UP",
    "INTERESTED",
    "MEETING_SCHEDULED",
    "MEETING_COMPLETED",
    "PROPOSAL_SENT",
    "NEGOTIATION",
    "WON",
    "LOST",
  ]),
  notes: z.string().trim().max(2000).optional().nullable(),
});

/**
 * Stage change for one deal. Writes an ActivityLog entry with from/to.
 * Moving to LOST requires a reason note (body notes or the deal's notes).
 * Reopening a Won/Lost deal is Admin-only. No project is ever created here
 * — a WON deal converts only via the explicit create-project endpoint.
 */
export async function POST(
  request: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  return handleRoute(async () => {
    const access = await moduleAccess("DEALS");
    if (!access.ok) return access.reason === "unauthenticated" ? unauthorized() : forbidden();
    const user = access.user;
    const level = access.level;
    const item = await prisma.deal.findFirst({
      where: { id: params.id, AND: [dealScopeForLevel(user, level) as never] },
      include: DEAL_INCLUDE,
    });
    if (!item) {
      const exists = await prisma.deal.findUnique({ where: { id: params.id }, select: { id: true } });
      if (exists) return forbidden("You cannot move this deal");
      return notFound("Deal not found");
    }
    if (level !== "ALL" && !canEditLinked(user, item))
      return forbidden("You cannot move this deal");
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return jsonError("Request body must be valid JSON", 400);
    }
    const parsed = moveSchema.safeParse(body);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return jsonError(
        first ? `${first.path.join(".") || "body"}: ${first.message}` : "Invalid body",
        422,
      );
    }
    const { status, notes } = parsed.data;
    if (
      (item.status === "WON" || item.status === "LOST") &&
      status !== item.status &&
      status !== "WON" &&
      status !== "LOST" &&
      level !== "ALL"
    ) {
      return forbidden("Only users with full deal access reopen Won or Lost deals");
    }
    const finalNotes = (notes ?? "").trim() || item.notes || "";
    if (status === "LOST" && !finalNotes.trim()) {
      return jsonError(
        "A lost deal requires a reason note — add one before moving to Lost.",
        422,
      );
    }
    // Stage exit checks (see src/lib/deal-stages.ts): PROPOSAL_SENT
    // needs a budget, WON needs a final price. Checked against the
    // deal's current figures — the move endpoint carries no budget.
    const exitError = stageExitError(status, item);
    if (exitError) return jsonError(exitError, 422);
    const updated = await prisma.deal.update({
      where: { id: item.id },
      data: {
        status,
        ...(notes !== undefined && notes !== null
          ? { notes: notes.trim() || null }
          : {}),
      },
      include: DEAL_INCLUDE,
    });
    await writeAudit(user.id, "DEAL_STAGE_CHANGED", "Deal", updated.id, {
      companyId: updated.companyId,
      title: updated.title,
      stageFrom: item.status,
      stageTo: status,
    });
    return jsonOk(updated);
  });
}
