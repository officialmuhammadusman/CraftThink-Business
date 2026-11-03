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
import { campaignSchema } from "@/lib/validation";
import { prisma } from "@/lib/prisma";
import { activityInclude } from "@/app/api/emails/shared";

async function loadCampaign(id: string, userId: string, all: boolean) {
  const campaign = await prisma.campaign.findUnique({
    where: { id },
    include: { owner: { select: { id: true, name: true, email: true } } },
  });
  if (!campaign) return null;
  if (!all && campaign.ownerId !== userId) return "forbidden" as const;
  return campaign;
}

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  return handleRoute(async () => {
    const access = await moduleAccess("CAMPAIGNS");
    if (!access.ok) return access.reason === "unauthenticated" ? unauthorized() : forbidden();
    const user = access.user;
    const level = access.level;
    const campaign = await loadCampaign(params.id, user.id, level === "ALL");
    if (!campaign) return notFound("Campaign not found");
    if (campaign === "forbidden") return forbidden();

    // Campaign activities are email records: hide them when the caller
    // has no EMAILS access, and scope them to assigned-only for ASSIGNED.
    const emailsLevel = await getPermission(user.id, "EMAILS");
    const activityWhere =
      emailsLevel === "NONE"
        ? { id: "__no_access__" }
        : emailsLevel === "ASSIGNED"
          ? { campaignId: params.id, assignedToId: user.id }
          : { campaignId: params.id };
    const [counts, activities] = await Promise.all([
      prisma.emailActivity.groupBy({
        by: ["status"],
        where: activityWhere as never,
        _count: { _all: true },
      }),
      prisma.emailActivity.findMany({
        where: activityWhere as never,
        orderBy: [{ sentAt: "desc" }, { createdAt: "desc" }],
        take: 100,
        include: activityInclude,
      }),
    ]);

    return jsonOk({
      campaign,
      countsByStatus: counts.map((c) => ({
        status: c.status,
        count: c._count._all,
      })),
      totalActivities: counts.reduce((sum, c) => sum + c._count._all, 0),
      activities,
    });
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  return handleRoute(async () => {
    const access = await moduleAccess("CAMPAIGNS");
    if (!access.ok) return access.reason === "unauthenticated" ? unauthorized() : forbidden();
    const user = access.user;
    const level = access.level;
    const parsed = await parseBody(request, campaignSchema.partial());
    if ("error" in parsed) return parsed.error;

    const campaign = await loadCampaign(params.id, user.id, level === "ALL");
    if (!campaign) return notFound("Campaign not found");
    if (campaign === "forbidden") return forbidden();

    const data: Record<string, unknown> = {};
    if (parsed.data.name !== undefined) data.name = parsed.data.name;
    if (parsed.data.description !== undefined)
      data.description = parsed.data.description ?? null;
    // Only ALL may reassign ownership; ASSIGNED naming another owner is forbidden.
    if (parsed.data.ownerId !== undefined && level === "ASSIGNED" && parsed.data.ownerId !== campaign.ownerId) {
      return forbidden("You may not reassign this campaign");
    }
    if (parsed.data.ownerId !== undefined && level === "ALL") {
      if (parsed.data.ownerId) {
        const owner = await prisma.user.findUnique({
          where: { id: parsed.data.ownerId },
        });
        if (!owner) return jsonError("Owner not found", 422);
        data.ownerId = owner.id;
      } else {
        data.ownerId = null;
      }
    }

    const updated = await prisma.campaign.update({
      where: { id: params.id },
      data: { ...data },
      include: { owner: { select: { id: true, name: true, email: true } } },
    });
    await writeAudit(user.id, "CAMPAIGN_UPDATED", "Campaign", updated.id, {
      name: updated.name,
    });
    return jsonOk(updated);
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  return handleRoute(async () => {
    const access = await moduleAccess("CAMPAIGNS");
    if (!access.ok) return access.reason === "unauthenticated" ? unauthorized() : forbidden();
    const user = access.user;
    const level = access.level;
    const campaign = await loadCampaign(params.id, user.id, level === "ALL");
    if (!campaign) return notFound("Campaign not found");
    if (campaign === "forbidden") return forbidden();

    // Email activities survive: their campaign FK is SetNull in the schema.
    await prisma.campaign.delete({ where: { id: params.id } });
    await writeAudit(user.id, "CAMPAIGN_DELETED", "Campaign", params.id, {
      name: campaign.name,
    });
    return jsonOk({ deleted: true });
  });
}
