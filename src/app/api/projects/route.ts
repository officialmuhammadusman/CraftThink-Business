import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { projectSchema } from "@/lib/validation";
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
  companyScope,
  isPrivileged,
  paginationMeta,
  parsePagination,
  projectScope,
} from "../companies/_scope";
import { PROJECT_INCLUDE } from "../_includes";

export async function GET(request: Request): Promise<NextResponse> {
  return handleRoute(async () => {
    const user = await requireAuth();
    if (!user) return unauthorized();
    const params = new URL(request.url).searchParams;
    const { page, limit, skip } = parsePagination(request);
    const status = (params.get("status") ?? "").trim();
    const companyId = (params.get("companyId") ?? "").trim();
    const managerId = (params.get("managerId") ?? "").trim();
    const and: Record<string, unknown>[] = [projectScope(user)];
    if (status) and.push({ status });
    if (companyId) and.push({ companyId });
    if (managerId) and.push({ managerId });
    const where = { AND: and };
    const [items, total] = await Promise.all([
      prisma.project.findMany({
        where: where as never,
        include: PROJECT_INCLUDE,
        orderBy: { updatedAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.project.count({ where: where as never }),
    ]);
    return jsonOk({ items, pagination: paginationMeta(total, page, limit) });
  });
}

export async function POST(request: Request): Promise<NextResponse> {
  return handleRoute(async () => {
    const user = await requireAuth();
    if (!user) return unauthorized();
    if (!isPrivileged(user) && user.role !== "PROJECT_MANAGER") {
      return forbidden("Only admins and project managers create projects");
    }
    const parsed = await parseBody(request, projectSchema);
    if ("error" in parsed) return parsed.error;
    const data = parsed.data;
    const company = await prisma.company.findFirst({
      where: { id: data.companyId, AND: [companyScope(user) as never] },
      select: { id: true, name: true },
    });
    if (!company) return notFound("Company not found");
    // A non-admin PM manages only their own projects.
    const managerId = isPrivileged(user)
      ? data.managerId?.trim() || null
      : user.id;
    if (managerId) {
      const manager = await prisma.user.findFirst({
        where: { id: managerId, active: true },
        select: { id: true },
      });
      if (!manager) return notFound("Project manager not found");
    }
    const developerIds = [...new Set((data.developerIds ?? []).map((d) => d.trim()).filter(Boolean))];
    if (developerIds.length > 0) {
      const found = await prisma.user.findMany({
        where: { id: { in: developerIds }, active: true },
        select: { id: true },
      });
      if (found.length !== developerIds.length)
        return notFound("One or more assigned developers were not found");
    }
    if (data.dealId) {
      const deal = await prisma.deal.findFirst({
        where: { id: data.dealId, companyId: company.id },
        select: { id: true },
      });
      if (!deal) return notFound("Deal not found for this company");
    }
    const item = await prisma.project.create({
      data: {
        dealId: data.dealId || undefined,
        companyId: company.id,
        name: data.name.trim(),
        description: data.description?.trim() || null,
        budget: data.budget ?? null,
        startDate: data.startDate ?? null,
        deadline: data.deadline ?? null,
        managerId,
        status: data.status,
        techStack: (data.techStack ?? []).map((t) => t.trim()).filter(Boolean),
        requirements: data.requirements?.trim() || null,
        internalNotes: data.internalNotes?.trim() || null,
        developers: { connect: developerIds.map((id) => ({ id })) },
      },
      include: PROJECT_INCLUDE,
    });
    await writeAudit(user.id, "PROJECT_CREATED", "Project", item.id, {
      companyId: company.id,
      name: item.name,
      status: item.status,
    });
    return jsonOk(item, 201);
  });
}
