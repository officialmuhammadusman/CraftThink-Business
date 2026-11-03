import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/rbac";
import {
  handleRoute,
  jsonError,
  jsonOk,
  parseBody,
  unauthorized,
  forbidden,
} from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import type { Prisma } from "@prisma/client";
import { campaignSchema } from "@/lib/validation";
import { prisma } from "@/lib/prisma";
import {
  parsePagination,
  paginationMeta,
  isAdmin,
  canManageOutreach,
} from "@/app/api/emails/shared";

export async function GET(request: Request): Promise<NextResponse> {
  return handleRoute(async () => {
    const user = await requireAuth();
    if (!user) return unauthorized();
    const params = new URL(request.url).searchParams;
    const { page, limit } = parsePagination(params);
    const search = params.get("search")?.trim() ?? "";

    // Non-admin roles see only campaigns they own.
    const where: Prisma.CampaignWhereInput = {};
    if (!isAdmin(user)) where.ownerId = user.id;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
      ];
    }

    const [total, items] = await prisma.$transaction([
      prisma.campaign.count({ where }),
      prisma.campaign.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          owner: { select: { id: true, name: true, email: true } },
          _count: { select: { emailActivities: true } },
        },
      }),
    ]);

    return jsonOk({ items, ...paginationMeta(total, page, limit) });
  });
}

export async function POST(request: Request): Promise<NextResponse> {
  return handleRoute(async () => {
    const user = await requireAuth();
    if (!user) return unauthorized();
    if (!canManageOutreach(user)) return forbidden();
    const parsed = await parseBody(request, campaignSchema);
    if ("error" in parsed) return parsed.error;

    // Non-admin creators always own their campaign; only admins may
    // assign a different owner.
    let ownerId: string | null = user.id;
    if (isAdmin(user) && parsed.data.ownerId) {
      const owner = await prisma.user.findUnique({
        where: { id: parsed.data.ownerId },
      });
      if (!owner) return jsonError("Owner not found", 422);
      ownerId = owner.id;
    }

    const campaign = await prisma.campaign.create({
      data: {
        name: parsed.data.name,
        description: parsed.data.description ?? undefined,
        ownerId,
      },
      include: { owner: { select: { id: true, name: true, email: true } } },
    });
    await writeAudit(user.id, "CAMPAIGN_CREATED", "Campaign", campaign.id, {
      name: campaign.name,
    });
    return jsonOk(campaign, 201);
  });
}
