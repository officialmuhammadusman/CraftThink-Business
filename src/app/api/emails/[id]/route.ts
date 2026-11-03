import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/rbac";
import {
  handleRoute,
  jsonError,
  jsonOk,
  parseBody,
  unauthorized,
  forbidden,
  notFound,
} from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { emailActivitySchema } from "@/lib/validation";
import { prisma } from "@/lib/prisma";
import {
  isAdmin,
  canManageOutreach,
  activityInclude,
  syncFollowUpForActivity,
  ensureSuppressed,
  deleteLinkedFollowUps,
} from "@/app/api/emails/shared";

async function loadActivity(id: string) {
  return prisma.emailActivity.findUnique({
    where: { id },
    include: activityInclude,
  });
}

/** Non-admin callers may only touch records assigned to them. */
function visibleTo(
  activity: { assignedToId: string | null },
  userId: string,
  admin: boolean,
): boolean {
  return admin || activity.assignedToId === userId;
}

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  return handleRoute(async () => {
    const user = await requireAuth();
    if (!user) return unauthorized();
    const activity = await loadActivity(params.id);
    if (!activity) return notFound("Email record not found");
    if (!visibleTo(activity, user.id, isAdmin(user))) return forbidden();

    const prefix = `Follow-up for tracked email ${activity.id}`;
    const followUps = await prisma.followUp.findMany({
      where: { reason: { startsWith: prefix } },
      orderBy: { dueDate: "asc" },
      include: {
        assignedTo: { select: { id: true, name: true, email: true } },
      },
    });
    return jsonOk({ ...activity, followUps });
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  return handleRoute(async () => {
    const user = await requireAuth();
    if (!user) return unauthorized();
    if (!canManageOutreach(user)) return forbidden();
    const parsed = await parseBody(request, emailActivitySchema.partial());
    if ("error" in parsed) return parsed.error;
    const data = parsed.data;
    const admin = isAdmin(user);

    const existing = await loadActivity(params.id);
    if (!existing) return notFound("Email record not found");
    if (!visibleTo(existing, user.id, admin)) return forbidden();

    const update: Record<string, unknown> = {};
    if (data.companyId !== undefined) {
      const company = await prisma.company.findUnique({
        where: { id: data.companyId },
        select: { id: true, assignedToId: true },
      });
      if (!company) return jsonError("Company not found", 422);
      if (!admin && company.assignedToId !== user.id) {
        return forbidden("Company is not assigned to you");
      }
      update.companyId = data.companyId;
    }
    const companyId = (update.companyId as string | undefined) ?? existing.companyId;
    if (data.contactId !== undefined) {
      if (data.contactId) {
        const contact = await prisma.contact.findUnique({
          where: { id: data.contactId },
          select: { id: true, companyId: true },
        });
        if (!contact || contact.companyId !== companyId) {
          return jsonError("Contact does not belong to this company", 422);
        }
        update.contactId = data.contactId;
      } else {
        update.contactId = null;
      }
    }
    if (data.campaignId !== undefined) {
      if (data.campaignId) {
        const campaign = await prisma.campaign.findUnique({
          where: { id: data.campaignId },
          select: { id: true, ownerId: true },
        });
        if (!campaign) return jsonError("Campaign not found", 422);
        if (!admin && campaign.ownerId !== user.id) {
          return forbidden("Campaign is not yours");
        }
        update.campaignId = data.campaignId;
      } else {
        update.campaignId = null;
      }
    }
    if (data.templateId !== undefined) {
      if (data.templateId) {
        const template = await prisma.emailTemplate.findUnique({
          where: { id: data.templateId },
          select: { id: true },
        });
        if (!template) return jsonError("Template not found", 422);
        update.templateId = data.templateId;
      } else {
        update.templateId = null;
      }
    }
    if (data.recipientEmail !== undefined) update.recipientEmail = data.recipientEmail;
    if (data.senderEmail !== undefined) update.senderEmail = data.senderEmail ?? null;
    if (data.subject !== undefined) update.subject = data.subject;
    if (data.body !== undefined) update.body = data.body;
    if (data.sequenceNumber !== undefined) update.sequenceNumber = data.sequenceNumber;
    if (data.status !== undefined) update.status = data.status;
    if (data.sentAt !== undefined) update.sentAt = data.sentAt ?? null;
    if (data.followUpDate !== undefined) update.followUpDate = data.followUpDate ?? null;
    if (data.assignedToId !== undefined) {
      // Non-admin editors may only keep the record assigned to themselves.
      if (admin) {
        if (data.assignedToId) {
          const assignee = await prisma.user.findUnique({
            where: { id: data.assignedToId },
            select: { id: true },
          });
          if (!assignee) return jsonError("Assigned employee not found", 422);
          update.assignedToId = data.assignedToId;
        } else {
          update.assignedToId = null;
        }
      } else if (data.assignedToId !== user.id) {
        return forbidden("You can only assign records to yourself");
      }
    }

    const updated = await prisma.emailActivity.update({
      where: { id: params.id },
      data: { ...update },
      include: activityInclude,
    });

    // Status-change enforcement: unsubscribing adds the recipient to
    // the Suppression list automatically.
    if (updated.status === "UNSUBSCRIBED") {
      await ensureSuppressed(updated.recipientEmail, "Unsubscribed via email status update");
    }
    await syncFollowUpForActivity(updated);
    await writeAudit(user.id, "EMAIL_ACTIVITY_UPDATED", "EmailActivity", updated.id, {
      recipientEmail: updated.recipientEmail,
      subject: updated.subject,
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
    // Delete is Admin / Super Admin only (task rule 3e).
    if (!isAdmin(user)) return forbidden();
    const existing = await loadActivity(params.id);
    if (!existing) return notFound("Email record not found");

    await deleteLinkedFollowUps(params.id);
    await prisma.emailActivity.delete({ where: { id: params.id } });
    await writeAudit(user.id, "EMAIL_ACTIVITY_DELETED", "EmailActivity", params.id, {
      recipientEmail: existing.recipientEmail,
      subject: existing.subject,
    });
    return jsonOk({ deleted: true });
  });
}
