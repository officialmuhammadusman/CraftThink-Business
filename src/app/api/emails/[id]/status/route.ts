import { NextResponse } from "next/server";
import { z } from "zod";
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
  canManageOutreach,
  activityInclude,
  syncFollowUpForActivity,
  ensureSuppressed,
  EMAIL_STATUSES,
} from "@/app/api/emails/shared";

const statusUpdateSchema = z.object({
  status: z.enum(EMAIL_STATUSES as unknown as [string, ...string[]]),
  // Free-text context for the change. Stored in the ActivityLog entry
  // (EmailActivity has no notes/reply-summary columns in the schema).
  notes: z.string().trim().max(2000).optional().nullable(),
  replySummary: z.string().trim().max(2000).optional().nullable(),
  followUpDate: z.coerce.date().optional().nullable(),
});

/**
 * POST /api/emails/[id]/status — change an email record's status with
 * an optional note and reply summary. UNSUBSCRIBED automatically adds
 * the recipient to the Suppression list; BOUNCED is flagged by its
 * status badge in the list UI. A follow-up date keeps the FollowUp
 * row in sync.
 */
export async function POST(
  request: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  return handleRoute(async () => {
    const user = await requireAuth();
    if (!user) return unauthorized();
    if (!canManageOutreach(user)) return forbidden();
    const parsed = await parseBody(request, statusUpdateSchema);
    if ("error" in parsed) return parsed.error;
    const admin = isAdmin(user);

    const existing = await prisma.emailActivity.findUnique({
      where: { id: params.id },
      include: activityInclude,
    });
    if (!existing) return notFound("Email record not found");
    if (!admin && existing.assignedToId !== user.id) return forbidden();

    const data: Record<string, unknown> = { status: parsed.data.status };
    if (parsed.data.followUpDate !== undefined) {
      data.followUpDate = parsed.data.followUpDate ?? null;
    }

    const updated = await prisma.emailActivity.update({
      where: { id: params.id },
      data: { ...data },
      include: activityInclude,
    });

    if (updated.status === "UNSUBSCRIBED") {
      await ensureSuppressed(
        updated.recipientEmail,
        parsed.data.replySummary ??
          parsed.data.notes ??
          "Unsubscribed via email status update",
      );
    }
    await syncFollowUpForActivity(updated);
    await writeAudit(user.id, "EMAIL_STATUS_CHANGED", "EmailActivity", updated.id, {
      fromStatus: existing.status,
      toStatus: updated.status,
      recipientEmail: updated.recipientEmail,
      notes: parsed.data.notes ?? undefined,
      replySummary: parsed.data.replySummary ?? undefined,
    });
    return jsonOk(updated);
  });
}
