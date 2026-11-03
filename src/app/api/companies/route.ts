import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { moduleAccess } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { companySchema } from "@/lib/validation";
import { prisma } from "@/lib/prisma";
import {
  forbidden,
  handleRoute,
  jsonOk,
  parseBody,
  unauthorized,
} from "@/lib/api";
import {
  companyScopeForLevel,
  findDuplicateCompany,
  paginationMeta,
  parsePagination,
} from "./_scope";

const COMPANY_INCLUDE = {
  assignedTo: { select: { id: true, name: true, email: true } },
  tags: { select: { id: true, name: true } },
  _count: {
    select: {
      contacts: true,
      emailActivities: true,
      deals: true,
      followUps: true,
    },
  },
} as const;

export async function GET(request: Request): Promise<NextResponse> {
  return handleRoute(async () => {
    const access = await moduleAccess("COMPANIES");
    if (!access.ok) return access.reason === "unauthenticated" ? unauthorized() : forbidden();
    const user = access.user;
    const level = access.level;
    const params = new URL(request.url).searchParams;
    const { page, limit, skip } = parsePagination(request);
    const search = (params.get("search") ?? "").trim();
    const country = (params.get("country") ?? "").trim();
    const industry = (params.get("industry") ?? "").trim();
    const status = (params.get("status") ?? "").trim();
    const priority = (params.get("priority") ?? "").trim();
    const assignedTo = (params.get("assignedTo") ?? "").trim();
    const tag = (params.get("tag") ?? "").trim();
    const contacted = params.get("contacted") ?? "";

    const and: Record<string, unknown>[] = [companyScopeForLevel(user, level)];
    const where = { AND: and } as Prisma.CompanyWhereInput;
    if (search) {
      and.push({
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { website: { contains: search, mode: "insensitive" } },
          { city: { contains: search, mode: "insensitive" } },
        ],
      });
    }
    if (country) and.push({ country: { equals: country, mode: "insensitive" } });
    if (industry)
      and.push({ industry: { equals: industry, mode: "insensitive" } });
    if (status) and.push({ status: { equals: status, mode: "insensitive" } });
    if (priority)
      and.push({ priority: { equals: priority, mode: "insensitive" } });
    if (assignedTo) and.push({ assignedToId: assignedTo });
    if (tag)
      and.push({ tags: { some: { name: { equals: tag, mode: "insensitive" } } } });
    if (contacted === "true") and.push({ emailActivities: { some: {} } });
    if (contacted === "false") and.push({ emailActivities: { none: {} } });

    const [items, total] = await Promise.all([
      prisma.company.findMany({
        where,
        include: COMPANY_INCLUDE,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.company.count({ where }),
    ]);
    return jsonOk({ items, pagination: paginationMeta(total, page, limit) });
  });
}

export async function POST(request: Request): Promise<NextResponse> {
  return handleRoute(async () => {
    const access = await moduleAccess("COMPANIES");
    if (!access.ok) return access.reason === "unauthenticated" ? unauthorized() : forbidden();
    const user = access.user;
    const level = access.level;
    const parsed = await parseBody(request, companySchema);
    if ("error" in parsed) return parsed.error;
    const data = parsed.data;

    const duplicate = await findDuplicateCompany(data.name, data.website);
    if (duplicate) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "A company with this name and website already exists (duplicate prevented).",
          data: duplicate,
        },
        { status: 409 },
      );
    }

    const website = data.website ? data.website.trim() : null;
    const tagNames = [...new Set((data.tagNames ?? []).map((t) => t.trim()).filter(Boolean))];
    // ASSIGNED creators may only create companies for themselves;
    // ALL may assign to anyone (or leave unassigned).
    if (level === "ASSIGNED" && data.assignedToId?.trim() && data.assignedToId.trim() !== user.id) {
      return forbidden("You may only create companies assigned to yourself");
    }
    const assignedToId =
      level === "ASSIGNED"
        ? data.assignedToId?.trim() || user.id
        : data.assignedToId?.trim() || null;

    try {
      const company = await prisma.company.create({
        data: {
          name: data.name.trim(),
          website: website || null,
          industry: data.industry?.trim() || null,
          country: data.country?.trim() || null,
          city: data.city?.trim() || null,
          size: data.size?.trim() || null,
          linkedinUrl: data.linkedinUrl?.trim() || null,
          description: data.description?.trim() || null,
          requirements: data.requirements?.trim() || null,
          researchNotes: data.researchNotes?.trim() || null,
          source: data.source?.trim() || null,
          status: data.status?.trim() || "NEW",
          priority: data.priority?.trim() || "MEDIUM",
          assignedToId: assignedToId || undefined,
          tags:
            tagNames.length > 0
              ? {
                  connectOrCreate: tagNames.map((name) => ({
                    where: { name },
                    create: { name },
                  })),
                }
              : undefined,
        },
        include: COMPANY_INCLUDE,
      });
      await writeAudit(user.id, "COMPANY_CREATED", "Company", company.id, {
        companyId: company.id,
        name: company.name,
      });
      return jsonOk(company, 201);
    } catch (error) {
      // Race with the @@unique([name, website]) constraint.
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code?: string }).code === "P2002"
      ) {
        const dup = await findDuplicateCompany(data.name, data.website);
        return NextResponse.json(
          {
            ok: false,
            error: "A company with this name and website already exists.",
            data: dup,
          },
          { status: 409 },
        );
      }
      throw error;
    }
  });
}
