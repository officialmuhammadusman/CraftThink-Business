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
import { campaignSchema } from "@/lib/validation";
import { prisma } from "@/lib/prisma";
import {
  activityInclude,
  isAdmin,
  canManageOutreach,
} from "@/app/api/emails/shared";

async function loadCampaign(id: string, userId: string, admin: boolean) {
  const campaign = await prisma.campaign.findUnique({
    where: { id },
    include: { owner: { select: { id: true, name: true, email: true } } },
  });
  if (!campaign) return null;
  if (!admin && campaign.ownerId !== userId) return "forbidden" as const;
  return campaign;
}

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  return handleRoute(async () => {
    const user = await requireAuth();
    if (!user) return unauthorized();
    const campaign = await loadCampaign(params.id, user.id, isAdmin(user));
    if (!campaign) return notFound("Campaign not found");
    if (campaign === "forbidden") return forbidden();

    const [counts, activities] = await Promise.all([
      prisma.emailActivity.groupBy({
        by: ["status"],
        where: { campaignId: params.id },
        _count: { _all: true },
      }),
      prisma.emailActivity.findMany({
        where: { campaignId: params.id },
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
    const user = await requireAuth();
    if (!user) return unauthorized();
    if (!canManageOutreach(user)) return forbidden();
    const parsed = await parseBody(request, campaignSchema.partial());
    if ("error" in parsed) return parsed.error;

    const campaign = await loadCampaign(params.id, user.id, isAdmin(user));
    if (!campaign) return notFound("Campaign not found");
    if (campaign === "forbidden") return forbidden();

    const data: Record<string, unknown> = {};
    if (parsed.data.name !== undefined) data.name = parsed.data.name;
    if (parsed.data.description !== undefined)
      data.description = parsed.data.description ?? null;
    // Only admins may reassign ownership.
    if (parsed.data.ownerId !== undefined && isAdmin(user)) {
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
    const user = await requireAuth();
    if (!user) return unauthorized();
    if (!canManageOutreach(user)) return forbidden();
    const campaign = await loadCampaign(params.id, user.id, isAdmin(user));
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
