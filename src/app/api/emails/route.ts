import { NextResponse } from "next/server";
import type { Prisma, EmailStatus } from "@prisma/client";
import { moduleAccess, getPermission } from "@/lib/rbac";
import {
  handleRoute,
  jsonError,
  jsonOk,
  parseBody,
  unauthorized,
  forbidden,
} from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { emailActivitySchema } from "@/lib/validation";
import { prisma } from "@/lib/prisma";
import {
  parsePagination,
  paginationMeta,
  activityInclude,
  syncFollowUpForActivity,
  endOfToday,
  FOLLOW_UP_DUE_EXCLUDED,
} from "@/app/api/emails/shared";

const SENT_LIKE = [
  "SENT",
  "DELIVERED",
  "REPLIED",
  "POSITIVE",
  "NEGATIVE",
  "FOLLOW_UP_REQUIRED",
] as const;

export async function GET(request: Request): Promise<NextResponse> {
  return handleRoute(async () => {
    const access = await moduleAccess("EMAILS");
    if (!access.ok) return access.reason === "unauthenticated" ? unauthorized() : forbidden();
    const user = access.user;
    const level = access.level;
    const params = new URL(request.url).searchParams;
    const { page, limit } = parsePagination(params);
    const admin = level === "ALL";

    const where: Prisma.EmailActivityWhereInput = {};
    // ASSIGNED sees only email records assigned to them.
    if (level === "ASSIGNED") where.assignedToId = user.id;

    const search = params.get("search")?.trim();
    if (search) {
      where.OR = [
        { subject: { contains: search, mode: "insensitive" } },
        { recipientEmail: { contains: search, mode: "insensitive" } },
        { company: { name: { contains: search, mode: "insensitive" } } },
      ];
    }
    const status = params.get("status")?.trim();
    if (status) where.status = status as EmailStatus;
    const campaignId = params.get("campaignId")?.trim();
    if (campaignId) where.campaignId = campaignId;
    const companyId = params.get("companyId")?.trim();
    if (companyId) where.companyId = companyId;
    // Non-admin callers may not widen the assignee filter past themselves.
    const assignedToId = params.get("assignedToId")?.trim();
    if (assignedToId && (admin || assignedToId === user.id)) {
      where.assignedToId = assignedToId;
    }
    const from = params.get("from")?.trim();
    const to = params.get("to")?.trim();
    if (from || to) {
      const range: Prisma.DateTimeFilter = {};
      if (from) {
        const d = new Date(from);
        if (!Number.isNaN(d.getTime())) range.gte = d;
      }
      if (to) {
        const d = new Date(to);
        if (!Number.isNaN(d.getTime())) range.lte = d;
      }
      if (Object.keys(range).length > 0) where.sentAt = range;
    }
    // "Follow-ups due": followUpDate <= today and status not terminal.
    if (params.get("followUpsDue") === "true") {
      where.followUpDate = { lte: endOfToday() };
      where.status = {
        notIn: [...FOLLOW_UP_DUE_EXCLUDED] as EmailStatus[],
      };
      // A status filter combined with follow-ups-due can only narrow
      // further; keep the explicit status if it is not terminal.
      if (status && !(FOLLOW_UP_DUE_EXCLUDED as readonly string[]).includes(status)) {
        where.status = status as EmailStatus;
      }
    }

    const [total, items] = await prisma.$transaction([
      prisma.emailActivity.count({ where }),
      prisma.emailActivity.findMany({
        where,
        orderBy: [{ sentAt: "desc" }, { createdAt: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
        include: activityInclude,
      }),
    ]);

    // Flag suppressed recipients and bounced rows in the list itself.
    const recipients = [...new Set(items.map((i) => i.recipientEmail.toLowerCase()))];
    const suppressedRows =
      recipients.length > 0
        ? await prisma.suppression.findMany({
            where: { email: { in: recipients } },
            select: { email: true },
          })
        : [];
    const suppressedSet = new Set(suppressedRows.map((r) => r.email));
    const flagged = items.map((item) => ({
      ...item,
      suppressed: suppressedSet.has(item.recipientEmail.toLowerCase()),
    }));

    // Filter dropdown options, scoped the same way as the list.
    const companyWhere: Prisma.CompanyWhereInput = {};
    if (!admin) companyWhere.assignedToId = user.id;
    const campaignWhere: Prisma.CampaignWhereInput = {};
    if (!admin) campaignWhere.ownerId = user.id;
    const [filterCompanies, filterCampaigns, filterUsers] = await Promise.all([
      prisma.company.findMany({
        where: companyWhere,
        orderBy: { name: "asc" },
        take: 200,
        select: { id: true, name: true },
      }),
      prisma.campaign.findMany({
        where: campaignWhere,
        orderBy: { name: "asc" },
        take: 200,
        select: { id: true, name: true },
      }),
      admin
        ? prisma.user.findMany({
            where: { active: true },
            orderBy: { name: "asc" },
            take: 200,
            select: { id: true, name: true, email: true },
          })
        : Promise.resolve([
            { id: user.id, name: user.name, email: user.email },
          ]),
    ]);

    return jsonOk({
      items: flagged,
      ...paginationMeta(total, page, limit),
      filters: {
        companies: filterCompanies,
        campaigns: filterCampaigns,
        users: filterUsers,
      },
    });
  });
}

export async function POST(request: Request): Promise<NextResponse> {
  return handleRoute(async () => {
    const access = await moduleAccess("EMAILS");
    if (!access.ok) return access.reason === "unauthenticated" ? unauthorized() : forbidden();
    const user = access.user;
    const level = access.level;
    const parsed = await parseBody(request, emailActivitySchema);
    if ("error" in parsed) return parsed.error;
    const data = parsed.data;
    const admin = level === "ALL";

    // Cross-module visibility: the company must be visible under the
    // caller's COMPANIES grant (ASSIGNED = in assigned scope, ALL = any,
    // NONE = no company reference allowed).
    const companiesLevel = await getPermission(user.id, "COMPANIES");
    if (companiesLevel === "NONE") return forbidden("You have no company access");
    const company = await prisma.company.findFirst({
      where: {
        id: data.companyId,
        ...(companiesLevel === "ASSIGNED"
          ? {
              OR: [
                { assignedToId: user.id },
                { projects: { some: { managerId: user.id } } },
                { projects: { some: { developers: { some: { id: user.id } } } } },
                { projects: { some: { tasks: { some: { assignedToId: user.id } } } } },
                { meetings: { some: { assignedToId: user.id } } },
              ],
            }
          : {}),
      },
      select: { id: true, assignedToId: true },
    });
    if (!company) return forbidden("Company is not visible to you");
    if (data.contactId) {
      const contact = await prisma.contact.findUnique({
        where: { id: data.contactId },
        select: { id: true, companyId: true },
      });
      if (!contact || contact.companyId !== data.companyId) {
        return jsonError("Contact does not belong to this company", 422);
      }
    }
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
    }
    if (data.templateId) {
      const template = await prisma.emailTemplate.findUnique({
        where: { id: data.templateId },
        select: { id: true },
      });
      if (!template) return jsonError("Template not found", 422);
    }
    // ASSIGNED creators record the activity against themselves so it
    // stays inside their scoped view; ALL may assign to anyone.
    if (level === "ASSIGNED" && data.assignedToId && data.assignedToId !== user.id) {
      return forbidden("You may only assign email records to yourself");
    }
    let assignedToId: string | null = admin ? (data.assignedToId ?? null) : user.id;
    if (assignedToId) {
      const assignee = await prisma.user.findUnique({
        where: { id: assignedToId },
        select: { id: true },
      });
      if (!assignee) return jsonError("Assigned employee not found", 422);
    }

    const sentAt =
      data.sentAt ??
      ((SENT_LIKE as readonly string[]).includes(data.status)
        ? new Date()
        : null);

    const activity = await prisma.emailActivity.create({
      data: {
        companyId: data.companyId,
        contactId: data.contactId ?? undefined,
        campaignId: data.campaignId ?? undefined,
        templateId: data.templateId ?? undefined,
        recipientEmail: data.recipientEmail,
        senderEmail: data.senderEmail ?? undefined,
        subject: data.subject,
        body: data.body,
        sequenceNumber: data.sequenceNumber,
        status: data.status,
        sentAt,
        followUpDate: data.followUpDate ?? undefined,
        assignedToId,
      },
      include: activityInclude,
    });

    await syncFollowUpForActivity(activity);
    await writeAudit(user.id, "EMAIL_ACTIVITY_CREATED", "EmailActivity", activity.id, {
      recipientEmail: activity.recipientEmail,
      subject: activity.subject,
      status: activity.status,
    });
    return jsonOk(activity, 201);
  });
}
