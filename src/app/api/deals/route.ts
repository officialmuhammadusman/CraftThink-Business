import { NextResponse } from "next/server";
import { moduleAccess, getPermission } from "@/lib/rbac";
import { DEAL_INCLUDE } from "./_include";
import { writeAudit } from "@/lib/audit";
import { dealSchema } from "@/lib/validation";
import { prisma } from "@/lib/prisma";
import {
  forbidden,
  handleRoute,
  jsonError,
  jsonOk,
  notFound,
  parseBody,
  unauthorized,
} from "@/lib/api";
import {
  companyScopeForLevel,
  dealScopeForLevel,
  paginationMeta,
  parsePagination,
} from "../companies/_scope";

export async function GET(request: Request): Promise<NextResponse> {
  return handleRoute(async () => {
    const access = await moduleAccess("DEALS");
    if (!access.ok) return access.reason === "unauthenticated" ? unauthorized() : forbidden();
    const user = access.user;
    const level = access.level;
    const params = new URL(request.url).searchParams;
    const { page, limit, skip } = parsePagination(request);
    const status = (params.get("status") ?? "").trim();
    const companyId = (params.get("companyId") ?? "").trim();
    const currency = (params.get("currency") ?? "").trim();
    const assignedTo = (params.get("assignedTo") ?? "").trim();
    const search = (params.get("search") ?? "").trim();

    const and: Record<string, unknown>[] = [dealScopeForLevel(user, level)];
    if (status) and.push({ status });
    if (companyId) and.push({ companyId });
    if (currency) and.push({ currency: { equals: currency, mode: "insensitive" } });
    if (assignedTo) and.push({ assignedToId: assignedTo });
    if (search) and.push({ title: { contains: search, mode: "insensitive" } });
    const where = { AND: and };
    const [items, total] = await Promise.all([
      prisma.deal.findMany({
        where: where as never,
        include: DEAL_INCLUDE,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.deal.count({ where: where as never }),
    ]);
    return jsonOk({ items, pagination: paginationMeta(total, page, limit) });
  });
}

export async function POST(request: Request): Promise<NextResponse> {
  return handleRoute(async () => {
    const access = await moduleAccess("DEALS");
    if (!access.ok) return access.reason === "unauthenticated" ? unauthorized() : forbidden();
    const user = access.user;
    const level = access.level;
    const parsed = await parseBody(request, dealSchema);
    if ("error" in parsed) return parsed.error;
    const data = parsed.data;
    const companiesLevel = await getPermission(user.id, "COMPANIES");
    if (companiesLevel === "NONE") return forbidden("You have no company access");
    const company = await prisma.company.findFirst({
      where: { id: data.companyId, AND: [companyScopeForLevel(user, companiesLevel) as never] },
      select: { id: true, name: true, assignedToId: true },
    });
    if (!company) return forbidden("Company is not visible to you");
    if (level === "ASSIGNED" && data.assignedToId && data.assignedToId !== user.id && company.assignedToId !== user.id) {
      return forbidden("You may only create deals assigned to yourself");
    }
    if (data.status === "LOST" && !(data.notes ?? "").trim()) {
      return jsonError("A lost deal requires a reason note", 422);
    }
    if (data.contactId) {
      const contact = await prisma.contact.findFirst({
        where: { id: data.contactId, companyId: company.id },
      });
      if (!contact) return notFound("Contact not found for this company");
    }
    const item = await prisma.deal.create({
      data: {
        companyId: company.id,
        contactId: data.contactId || undefined,
        title: data.title.trim(),
        services: data.services ?? [],
        estimatedBudget: data.estimatedBudget ?? null,
        currency: data.currency ?? "USD",
        expectedCloseDate: data.expectedCloseDate ?? null,
        status: data.status,
        finalPrice: data.finalPrice ?? null,
        notes: data.notes?.trim() || null,
        assignedToId: data.assignedToId?.trim() || user.id,
      },
      include: DEAL_INCLUDE,
    });
    await writeAudit(user.id, "DEAL_CREATED", "Deal", item.id, {
      companyId: company.id,
      title: item.title,
      status: item.status,
    });
    return jsonOk(item, 201);
  });
}
