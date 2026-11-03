import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { companySchema } from "@/lib/validation";
import { prisma } from "@/lib/prisma";
import {
  forbidden,
  handleRoute,
  jsonError,
  jsonOk,
  notFound,
  unauthorized,
} from "@/lib/api";
import {
  canEditLead,
  companyScope,
  findDuplicateCompany,
  isPrivileged,
  pickPresent,
} from "../_scope";

const patchSchema = companySchema.partial().omit({ tagNames: true }).extend({
  tagNames: z.array(z.string().trim().min(1).max(100)).max(50).optional(),
});

const DETAIL_INCLUDE = {
  assignedTo: { select: { id: true, name: true, email: true } },
  tags: { select: { id: true, name: true } },
  contacts: { orderBy: { createdAt: "asc" as const } },
  emailActivities: {
    orderBy: { createdAt: "desc" as const },
    include: {
      contact: { select: { id: true, fullName: true } },
      campaign: { select: { id: true, name: true } },
      template: { select: { id: true, name: true } },
    },
  },
  followUps: {
    orderBy: { dueDate: "asc" as const },
    include: {
      contact: { select: { id: true, fullName: true } },
      assignedTo: { select: { id: true, name: true } },
    },
  },
  meetings: {
    orderBy: { dateTime: "desc" as const },
    include: {
      contact: { select: { id: true, fullName: true } },
      assignedTo: { select: { id: true, name: true } },
    },
  },
  deals: {
    orderBy: { createdAt: "desc" as const },
    include: {
      contact: { select: { id: true, fullName: true } },
      assignedTo: { select: { id: true, name: true } },
    },
  },
  projects: { select: { id: true, name: true, status: true, budget: true } },
} as const;

async function visibleCompany(userId: string, companyId: string, scope: object) {
  return prisma.company.findFirst({
    where: { id: companyId, AND: [scope as never] },
    include: DETAIL_INCLUDE,
  });
}

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  return handleRoute(async () => {
    const user = await requireAuth();
    if (!user) return unauthorized();
    const company = await visibleCompany(user.id, params.id, companyScope(user));
    if (!company) return notFound("Company not found");
    const activity = await prisma.activityLog.findMany({
      where: {
        OR: [
          { entityType: "Company", entityId: company.id },
          { details: { path: ["companyId"], equals: company.id } },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { actor: { select: { id: true, name: true, email: true } } },
    });
    return jsonOk({ ...company, activityLog: activity });
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  return handleRoute(async () => {
    const user = await requireAuth();
    if (!user) return unauthorized();
    const existing = await prisma.company.findFirst({
      where: { id: params.id, AND: [companyScope(user) as never] },
      select: { id: true, name: true, website: true, assignedToId: true },
    });
    if (!existing) return notFound("Company not found");
    if (!canEditLead(user, existing)) return forbidden("You cannot edit this company");
    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return jsonError("Request body must be valid JSON", 400);
    }
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return jsonError(
        first ? `${first.path.join(".") || "body"}: ${first.message}` : "Invalid body",
        422,
      );
    }
    const data = pickPresent(body, parsed.data);
    const nextName = (data.name as string | undefined) ?? existing.name;
    const nextWebsite =
      "website" in data ? ((data.website as string | null) ?? null) : existing.website;
    if ("name" in data || "website" in data) {
      const dup = await findDuplicateCompany(nextName, nextWebsite);
      if (dup && dup.id !== existing.id) {
        return NextResponse.json(
          {
            ok: false,
            error: "Another company with this name and website already exists.",
            data: dup,
          },
          { status: 409 },
        );
      }
    }
    const { tagNames, ...rest } = data as typeof data & {
      tagNames?: string[];
    };
    const clean: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(rest)) {
      clean[key] = typeof value === "string" ? value.trim() || null : value;
    }
    if (typeof clean.name === "string") clean.name = (clean.name as string).trim();
    const updated = await prisma.company.update({
      where: { id: existing.id },
      data: {
        ...clean,
        ...(tagNames
          ? {
              tags: {
                set: [],
                connectOrCreate: [...new Set(tagNames.map((t) => t.trim()).filter(Boolean))].map(
                  (name) => ({ where: { name }, create: { name } }),
                ),
              },
            }
          : {}),
      },
      include: DETAIL_INCLUDE,
    });
    await writeAudit(user.id, "COMPANY_UPDATED", "Company", updated.id, {
      companyId: updated.id,
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
    if (!isPrivileged(user)) return forbidden("Only Admin / Super Admin delete companies");
    const company = await prisma.company.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        name: true,
        _count: { select: { deals: true, projects: true } },
      },
    });
    if (!company) return notFound("Company not found");
    if (company._count.deals > 0 || company._count.projects > 0) {
      return jsonError(
        `Cannot delete: this company still has ${company._count.deals} deal(s) and ${company._count.projects} project(s). Remove or reassign them first.`,
        409,
      );
    }
    await prisma.company.delete({ where: { id: company.id } });
    await writeAudit(user.id, "COMPANY_DELETED", "Company", company.id, {
      companyId: company.id,
      name: company.name,
    });
    return jsonOk({ deleted: true });
  });
}
