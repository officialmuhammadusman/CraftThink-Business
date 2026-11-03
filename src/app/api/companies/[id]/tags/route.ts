import { NextResponse } from "next/server";
import { z } from "zod";
import { moduleAccess } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import {
  forbidden,
  handleRoute,
  jsonError,
  jsonOk,
  notFound,
  unauthorized,
} from "@/lib/api";
import { companyScopeForLevel } from "../../_scope";
import type { PermLevel } from "@/lib/rbac";

const assignSchema = z.object({ name: z.string().trim().min(1).max(100) });
const removeSchema = z.object({
  tagId: z.string().optional(),
  name: z.string().trim().min(1).max(100).optional(),
});

async function visibleCompany(user: { id: string }, companyId: string, level: PermLevel) {
  const company = await prisma.company.findFirst({
    where: { id: companyId, AND: [companyScopeForLevel(user as never, level) as never] },
    select: { id: true, name: true, assignedToId: true },
  });
  if (company) return company;
  const exists = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true },
  });
  return exists ? ("forbidden" as const) : null;
}

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  return handleRoute(async () => {
    const access = await moduleAccess("COMPANIES");
    if (!access.ok) return access.reason === "unauthenticated" ? unauthorized() : forbidden();
    const user = access.user;
    const level = access.level;
    const company = await visibleCompany(user, params.id, level);
    if (company === "forbidden") return forbidden();
    if (!company) return notFound("Company not found");
    const tags = await prisma.tag.findMany({
      where: { companies: { some: { id: company.id } } },
      orderBy: { name: "asc" },
    });
    return jsonOk({ items: tags });
  });
}

/** Assign a tag, creating it first when it does not exist yet. */
export async function POST(
  request: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  return handleRoute(async () => {
    const access = await moduleAccess("COMPANIES");
    if (!access.ok) return access.reason === "unauthenticated" ? unauthorized() : forbidden();
    const user = access.user;
    const level = access.level;
    const company = await visibleCompany(user, params.id, level);
    if (company === "forbidden") return forbidden("You cannot tag this company");
    if (!company) return notFound("Company not found");
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return jsonError("Request body must be valid JSON", 400);
    }
    const parsed = assignSchema.safeParse(body);
    if (!parsed.success) return jsonError("Tag name is required", 422);
    const name = parsed.data.name.trim();
    let tag = await prisma.tag.findFirst({
      where: { name: { equals: name, mode: "insensitive" } },
    });
    if (!tag) {
      try {
        tag = await prisma.tag.create({ data: { name } });
      } catch {
        tag = await prisma.tag.findFirst({
          where: { name: { equals: name, mode: "insensitive" } },
        });
        if (!tag) throw new Error("Could not create tag");
      }
    }
    await prisma.company.update({
      where: { id: company.id },
      data: { tags: { connect: { id: tag.id } } },
    });
    await writeAudit(user.id, "TAG_ASSIGNED", "Tag", tag.id, {
      companyId: company.id,
      tagName: tag.name,
    });
    return jsonOk(tag, 201);
  });
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  return handleRoute(async () => {
    const access = await moduleAccess("COMPANIES");
    if (!access.ok) return access.reason === "unauthenticated" ? unauthorized() : forbidden();
    const user = access.user;
    const level = access.level;
    const company = await visibleCompany(user, params.id, level);
    if (company === "forbidden") return forbidden("You cannot remove tags from this company");
    if (!company) return notFound("Company not found");
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return jsonError("Request body must be valid JSON", 400);
    }
    const parsed = removeSchema.safeParse(body);
    if (!parsed.success) return jsonError("Provide tagId or name", 422);
    const tag = parsed.data.tagId
      ? await prisma.tag.findUnique({ where: { id: parsed.data.tagId } })
      : parsed.data.name
        ? await prisma.tag.findFirst({
            where: { name: { equals: parsed.data.name, mode: "insensitive" } },
          })
        : null;
    if (!tag) return notFound("Tag not found");
    await prisma.company.update({
      where: { id: company.id },
      data: { tags: { disconnect: { id: tag.id } } },
    });
    await writeAudit(user.id, "TAG_REMOVED", "Tag", tag.id, {
      companyId: company.id,
      tagName: tag.name,
    });
    return jsonOk({ removed: true });
  });
}
