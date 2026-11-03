import { NextResponse } from "next/server";
import { moduleAccess, getPermission } from "@/lib/rbac";
import { forbidden, handleRoute, jsonOk, unauthorized } from "@/lib/api";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Lookup data for the fast-entry form and list filters. Scoped the same
 * way as the list routes: non-admin roles only see companies assigned to
 * them, campaigns they own, and themselves as an assignee. Templates are
 * shared content, so all templates are returned.
 */
export async function GET(request: Request): Promise<NextResponse> {
  return handleRoute(async () => {
    const access = await moduleAccess("EMAILS");
    if (!access.ok) return access.reason === "unauthenticated" ? unauthorized() : forbidden();
    const user = access.user;
    const level = access.level;
    const params = new URL(request.url).searchParams;
    const companyId = params.get("companyId") ?? "";
    const search = params.get("search")?.trim() ?? "";
    const admin = level === "ALL";

    const companyWhere: Prisma.CompanyWhereInput = {};
    if (!admin) companyWhere.assignedToId = user.id;
    if (search) {
      companyWhere.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { website: { contains: search, mode: "insensitive" } },
      ];
    }

    const companies = await prisma.company.findMany({
      where: companyWhere,
      orderBy: { name: "asc" },
      take: 50,
      select: { id: true, name: true, website: true, industry: true },
    });

    let contacts: { id: string; fullName: string; email: string }[] = [];
    if (companyId) {
      const company = await prisma.company.findUnique({
        where: { id: companyId },
        select: { id: true, assignedToId: true },
      });
      const visible =
        company && (admin || company.assignedToId === user.id);
      if (visible) {
        contacts = await prisma.contact.findMany({
          where: { companyId },
          orderBy: { fullName: "asc" },
          take: 200,
          select: { id: true, fullName: true, email: true },
        });
      }
    }

    const campaignWhere: Prisma.CampaignWhereInput = {};
    if (!admin) campaignWhere.ownerId = user.id;
    const templatesLevel = await getPermission(user.id, "TEMPLATES");
    const [campaigns, templates, users] = await Promise.all([
      prisma.campaign.findMany({
        where: campaignWhere,
        orderBy: { name: "asc" },
        take: 100,
        select: { id: true, name: true },
      }),
      templatesLevel === "NONE"
        ? Promise.resolve([])
        : prisma.emailTemplate.findMany({
            orderBy: { name: "asc" },
            take: 100,
            select: { id: true, name: true, industry: true, subject: true, body: true },
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

    return jsonOk({ companies, contacts, campaigns, templates, users });
  });
}
