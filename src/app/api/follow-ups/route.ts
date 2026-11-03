import { NextResponse } from "next/server";
import { moduleAccess, getPermission } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { followUpSchema } from "@/lib/validation";
import { prisma } from "@/lib/prisma";
import {
  forbidden,
  handleRoute,
  jsonOk,
  notFound,
  parseBody,
  unauthorized,
} from "@/lib/api";
import {
  companyScopeForLevel,
  linkedScopeForLevel,
  paginationMeta,
  parsePagination,
} from "../companies/_scope";

const INCLUDE = {
  company: { select: { id: true, name: true } },
  contact: { select: { id: true, fullName: true } },
  assignedTo: { select: { id: true, name: true, email: true } },
} as const;

function dayBounds(date: Date): { start: Date; end: Date } {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

export async function GET(request: Request): Promise<NextResponse> {
  return handleRoute(async () => {
    const access = await moduleAccess("FOLLOW_UPS");
    if (!access.ok) return access.reason === "unauthenticated" ? unauthorized() : forbidden();
    const user = access.user;
    const level = access.level;
    const params = new URL(request.url).searchParams;
    const { page, limit, skip } = parsePagination(request);
    const view = params.get("view") ?? "all"; // today | overdue | upcoming | all
    const status = (params.get("status") ?? "").trim();
    const companyId = (params.get("companyId") ?? "").trim();
    const assignedTo = (params.get("assignedTo") ?? "").trim();
    const now = new Date();
    const { start, end } = dayBounds(now);

    const and: Record<string, unknown>[] = [linkedScopeForLevel(user, level)];
    if (view === "today") {
      and.push({ dueDate: { gte: start, lte: end }, status: "PENDING" });
    } else if (view === "overdue") {
      and.push({
        dueDate: { lt: start },
        status: { in: ["PENDING", "OVERDUE"] },
      });
    } else if (view === "upcoming") {
      and.push({ dueDate: { gt: end }, status: "PENDING" });
    }
    if (status) and.push({ status });
    if (companyId) and.push({ companyId });
    if (assignedTo) and.push({ assignedToId: assignedTo });

    const where = { AND: and };
    const [items, total] = await Promise.all([
      prisma.followUp.findMany({
        where: where as never,
        include: INCLUDE,
        orderBy: { dueDate: "asc" },
        skip,
        take: limit,
      }),
      prisma.followUp.count({ where: where as never }),
    ]);
    return jsonOk({ items, pagination: paginationMeta(total, page, limit) });
  });
}

export async function POST(request: Request): Promise<NextResponse> {
  return handleRoute(async () => {
    const access = await moduleAccess("FOLLOW_UPS");
    if (!access.ok) return access.reason === "unauthenticated" ? unauthorized() : forbidden();
    const user = access.user;
    const level = access.level;
    const parsed = await parseBody(request, followUpSchema);
    if ("error" in parsed) return parsed.error;
    const data = parsed.data;
    // The company must be visible under the caller's COMPANIES grant.
    const companiesLevel = await getPermission(user.id, "COMPANIES");
    if (companiesLevel === "NONE") return forbidden("You have no company access");
    const company = await prisma.company.findFirst({
      where: { id: data.companyId, AND: [companyScopeForLevel(user, companiesLevel) as never] },
      select: { id: true, name: true, assignedToId: true },
    });
    if (!company) return forbidden("Company is not visible to you");
    // ASSIGNED creators may only create follow-ups assigned to themselves
    // unless the company itself is assigned to them.
    if (
      level === "ASSIGNED" &&
      company.assignedToId !== user.id &&
      data.assignedToId &&
      data.assignedToId !== user.id
    ) {
      return forbidden("You cannot create follow-ups assigned to someone else");
    }
    if (data.contactId) {
      const contact = await prisma.contact.findFirst({
        where: { id: data.contactId, companyId: company.id },
      });
      if (!contact) return notFound("Contact not found for this company");
    }
    const item = await prisma.followUp.create({
      data: {
        companyId: company.id,
        contactId: data.contactId || undefined,
        dueDate: data.dueDate,
        reason: data.reason?.trim() || null,
        notes: data.notes?.trim() || null,
        status: data.status ?? "PENDING",
        assignedToId: data.assignedToId?.trim() || user.id,
      },
      include: INCLUDE,
    });
    await writeAudit(user.id, "FOLLOWUP_CREATED", "FollowUp", item.id, {
      companyId: company.id,
      dueDate: item.dueDate.toISOString(),
    });
    return jsonOk(item, 201);
  });
}
