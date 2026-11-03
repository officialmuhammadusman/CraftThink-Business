import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/rbac";
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
  companyScope,
  dealScope,
  isPrivileged,
  paginationMeta,
  parsePagination,
} from "../companies/_scope";

export const DEAL_INCLUDE = {
  company: { select: { id: true, name: true } },
  contact: { select: { id: true, fullName: true } },
  assignedTo: { select: { id: true, name: true, email: true } },
  projects: { select: { id: true, name: true, status: true } },
} as const;

export async function GET(request: Request): Promise<NextResponse> {
  return handleRoute(async () => {
    const user = await requireAuth();
    if (!user) return unauthorized();
    const params = new URL(request.url).searchParams;
    const { page, limit, skip } = parsePagination(request);
    const status = (params.get("status") ?? "").trim();
    const companyId = (params.get("companyId") ?? "").trim();
    const assignedTo = (params.get("assignedTo") ?? "").trim();
    const search = (params.get("search") ?? "").trim();

    const and: Record<string, unknown>[] = [dealScope(user)];
    if (status) and.push({ status });
    if (companyId) and.push({ companyId });
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
    const user = await requireAuth();
    if (!user) return unauthorized();
    if (
      user.role !== "SUPER_ADMIN" &&
      user.role !== "ADMIN" &&
      user.role !== "SALES_EXECUTIVE"
    ) {
      return forbidden("Only sales and admins create deals");
    }
    const parsed = await parseBody(request, dealSchema);
    if ("error" in parsed) return parsed.error;
    const data = parsed.data;
    const company = await prisma.company.findFirst({
      where: { id: data.companyId, AND: [companyScope(user) as never] },
      select: { id: true, name: true, assignedToId: true },
    });
    if (!company) return notFound("Company not found");
    if (!isPrivileged(user) && company.assignedToId !== user.id) {
      return forbidden("You cannot create deals for this company");
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
