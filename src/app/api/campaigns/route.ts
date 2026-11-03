import { NextResponse } from "next/server";
import { moduleAccess } from "@/lib/rbac";
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
} from "@/app/api/emails/shared";

export async function GET(request: Request): Promise<NextResponse> {
  return handleRoute(async () => {
    const access = await moduleAccess("CAMPAIGNS");
    if (!access.ok) return access.reason === "unauthenticated" ? unauthorized() : forbidden();
    const user = access.user;
    const level = access.level;
    const params = new URL(request.url).searchParams;
    const { page, limit } = parsePagination(params);
    const search = params.get("search")?.trim() ?? "";

    // ASSIGNED sees only campaigns they own; ALL sees everything.
    const where: Prisma.CampaignWhereInput = {};
    if (level === "ASSIGNED") where.ownerId = user.id;
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
    const access = await moduleAccess("CAMPAIGNS");
    if (!access.ok) return access.reason === "unauthenticated" ? unauthorized() : forbidden();
    const user = access.user;
    const level = access.level;
    const parsed = await parseBody(request, campaignSchema);
    if ("error" in parsed) return parsed.error;

    // ASSIGNED creators always own their campaign and may not assign
    // it to someone else; ALL may assign a different owner.
    let ownerId: string | null = user.id;
    if (level === "ASSIGNED" && parsed.data.ownerId && parsed.data.ownerId !== user.id) {
      return forbidden("You may only create campaigns for yourself");
    }
    if (level === "ALL" && parsed.data.ownerId) {
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
