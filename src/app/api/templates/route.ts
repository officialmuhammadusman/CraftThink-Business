import { NextResponse } from "next/server";
import { moduleAccess } from "@/lib/rbac";
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
} from "@/app/api/emails/shared";

// Templates are shared content: TEMPLATES=ASSIGNED or ALL may read the
// shared library (needed to compose assigned emails). Creating,
// editing and deleting a shared template require TEMPLATES=ALL.
export async function GET(request: Request): Promise<NextResponse> {
  return handleRoute(async () => {
    const access = await moduleAccess("TEMPLATES");
    if (!access.ok) return access.reason === "unauthenticated" ? unauthorized() : forbidden();
    const user = access.user;
    const level = access.level;
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
    const access = await moduleAccess("TEMPLATES");
    if (!access.ok) return access.reason === "unauthenticated" ? unauthorized() : forbidden();
    const user = access.user;
    const level = access.level;
    if (level !== "ALL") return forbidden("Only users with full template access may create templates");
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
