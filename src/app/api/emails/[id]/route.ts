import { NextResponse } from "next/server";
import { moduleAccess, getPermission } from "@/lib/rbac";
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

/** ASSIGNED callers may only touch records assigned to them; ALL may touch any. */
function visibleTo(
  activity: { assignedToId: string | null },
  userId: string,
  all: boolean,
): boolean {
  return all || activity.assignedToId === userId;
}

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  return handleRoute(async () => {
    const access = await moduleAccess("EMAILS");
    if (!access.ok) return access.reason === "unauthenticated" ? unauthorized() : forbidden();
    const user = access.user;
    const level = access.level;
    const activity = await loadActivity(params.id);
    if (!activity) return notFound("Email record not found");
    if (!visibleTo(activity, user.id, level === "ALL")) return forbidden();

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
    const access = await moduleAccess("EMAILS");
    if (!access.ok) return access.reason === "unauthenticated" ? unauthorized() : forbidden();
    const user = access.user;
    const level = access.level;
    const parsed = await parseBody(request, emailActivitySchema.partial());
    if ("error" in parsed) return parsed.error;
    const data = parsed.data;
    const admin = level === "ALL";

    const existing = await loadActivity(params.id);
    if (!existing) return notFound("Email record not found");
    if (!visibleTo(existing, user.id, admin)) return forbidden();

    const update: Record<string, unknown> = {};
    if (data.companyId !== undefined) {
      const companiesLevel = await getPermission(user.id, "COMPANIES");
      if (companiesLevel === "NONE") return forbidden("You have no company access");
      const company = await prisma.company.findFirst({
        where: {
          id: data.companyId,
          ...(companiesLevel === "ASSIGNED" ? { assignedToId: user.id } : {}),
        },
        select: { id: true, assignedToId: true },
      });
      if (!company) return forbidden("Company is not visible to you");
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
        const campaignsLevel = await getPermission(user.id, "CAMPAIGNS");
        if (campaignsLevel === "NONE") return forbidden("You have no campaign access");
        const campaign = await prisma.campaign.findFirst({
          where: {
            id: data.campaignId,
            ...(campaignsLevel === "ASSIGNED" ? { ownerId: user.id } : {}),
          },
          select: { id: true, ownerId: true },
        });
        if (!campaign) return forbidden("Campaign is not visible to you");
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
      // ASSIGNED editors may only keep the record assigned to themselves.
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
    const access = await moduleAccess("EMAILS");
    if (!access.ok) return access.reason === "unauthenticated" ? unauthorized() : forbidden();
    const user = access.user;
    const level = access.level;
    // Email deletion requires full email access.
    if (level !== "ALL") return forbidden();
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
