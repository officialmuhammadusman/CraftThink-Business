import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/rbac";
import {
  handleRoute,
  jsonOk,
  parseBody,
  unauthorized,
  forbidden,
} from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import type { Prisma } from "@prisma/client";
import { templateSchema } from "@/lib/validation";
import { prisma } from "@/lib/prisma";
import {
  parsePagination,
  paginationMeta,
  canManageOutreach,
} from "@/app/api/emails/shared";

// Templates are shared content (per the RBAC matrix: every seller uses
// the same good templates), so the list is visible to all signed-in
// users. Creating/editing is limited to Super Admin, Admin, and Sales
// Executive; deleting is Admin/Super Admin only (see [id]/route.ts).
export async function GET(request: Request): Promise<NextResponse> {
  return handleRoute(async () => {
    const user = await requireAuth();
    if (!user) return unauthorized();
    const params = new URL(request.url).searchParams;
    const { page, limit } = parsePagination(params);
    const search = params.get("search")?.trim() ?? "";
    const industry = params.get("industry")?.trim() ?? "";

    const where: Prisma.EmailTemplateWhereInput = {};
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { subject: { contains: search, mode: "insensitive" } },
      ];
    }
    if (industry) where.industry = { equals: industry, mode: "insensitive" };

    const [total, items] = await prisma.$transaction([
      prisma.emailTemplate.count({ where }),
      prisma.emailTemplate.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
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
    const parsed = await parseBody(request, templateSchema);
    if ("error" in parsed) return parsed.error;

    const template = await prisma.emailTemplate.create({
      data: {
        name: parsed.data.name,
        industry: parsed.data.industry ?? undefined,
        subject: parsed.data.subject,
        body: parsed.data.body,
      },
    });
    await writeAudit(user.id, "TEMPLATE_CREATED", "EmailTemplate", template.id, {
      name: template.name,
    });
    return jsonOk(template, 201);
  });
}
