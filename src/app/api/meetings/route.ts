import { NextResponse } from "next/server";
import { moduleAccess, getPermission } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { meetingSchema } from "@/lib/validation";
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
  meetingScopeForLevel,
  paginationMeta,
  parsePagination,
} from "../companies/_scope";

const INCLUDE = {
  company: { select: { id: true, name: true } },
  contact: { select: { id: true, fullName: true } },
  assignedTo: { select: { id: true, name: true, email: true } },
} as const;

export async function GET(request: Request): Promise<NextResponse> {
  return handleRoute(async () => {
    const access = await moduleAccess("MEETINGS");
    if (!access.ok) return access.reason === "unauthenticated" ? unauthorized() : forbidden();
    const user = access.user;
    const level = access.level;
    const params = new URL(request.url).searchParams;
    const { page, limit, skip } = parsePagination(request);
    const status = (params.get("status") ?? "").trim();
    const companyId = (params.get("companyId") ?? "").trim();
    const assignedTo = (params.get("assignedTo") ?? "").trim();
    const from = params.get("from") ?? "";
    const to = params.get("to") ?? "";

    const and: Record<string, unknown>[] = [meetingScopeForLevel(user, level)];
    if (status) and.push({ status });
    if (companyId) and.push({ companyId });
    if (assignedTo) and.push({ assignedToId: assignedTo });
    if (from || to) {
      const range: Record<string, Date> = {};
      if (from) range.gte = new Date(from);
      if (to) range.lte = new Date(to);
      and.push({ dateTime: range });
    }
    const where = { AND: and };
    const [items, total] = await Promise.all([
      prisma.meeting.findMany({
        where: where as never,
        include: INCLUDE,
        orderBy: { dateTime: "asc" },
        skip,
        take: limit,
      }),
      prisma.meeting.count({ where: where as never }),
    ]);
    return jsonOk({ items, pagination: paginationMeta(total, page, limit) });
  });
}

export async function POST(request: Request): Promise<NextResponse> {
  return handleRoute(async () => {
    const access = await moduleAccess("MEETINGS");
    if (!access.ok) return access.reason === "unauthenticated" ? unauthorized() : forbidden();
    const user = access.user;
    const level = access.level;
    const parsed = await parseBody(request, meetingSchema);
    if ("error" in parsed) return parsed.error;
    const data = parsed.data;
    const companiesLevel = await getPermission(user.id, "COMPANIES");
    if (companiesLevel === "NONE") return forbidden("You have no company access");
    const company = await prisma.company.findFirst({
      where: { id: data.companyId, AND: [companyScopeForLevel(user, companiesLevel) as never] },
      select: { id: true, name: true, assignedToId: true },
    });
    if (!company) return forbidden("Company is not visible to you");
    if (
      level === "ASSIGNED" &&
      company.assignedToId !== user.id &&
      data.assignedToId !== user.id
    ) {
      return forbidden("You cannot create meetings for this company");
    }
    if (level === "ASSIGNED" && data.assignedToId && data.assignedToId !== user.id && company.assignedToId === user.id) {
      // Meeting assigned to someone else for a company assigned to the
      // caller is allowed only with full access; ASSIGNED keeps it own.
      return forbidden("You may only create meetings assigned to yourself");
    }
    if (data.contactId) {
      const contact = await prisma.contact.findFirst({
        where: { id: data.contactId, companyId: company.id },
      });
      if (!contact) return notFound("Contact not found for this company");
    }
    const item = await prisma.meeting.create({
      data: {
        companyId: company.id,
        contactId: data.contactId || undefined,
        title: data.title.trim(),
        dateTime: data.dateTime,
        platform: data.platform?.trim() || null,
        link: data.link?.trim() || null,
        assignedToId: data.assignedToId?.trim() || user.id,
        status: data.status ?? "SCHEDULED",
        notes: data.notes?.trim() || null,
        requirements: data.requirements?.trim() || null,
        budgetNotes: data.budgetNotes?.trim() || null,
        nextSteps: data.nextSteps?.trim() || null,
      },
      include: INCLUDE,
    });
    await writeAudit(user.id, "MEETING_CREATED", "Meeting", item.id, {
      companyId: company.id,
      title: item.title,
      dateTime: item.dateTime.toISOString(),
    });
    return jsonOk(item, 201);
  });
}
