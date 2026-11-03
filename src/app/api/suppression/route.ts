import { NextResponse } from "next/server";
import { moduleAccess } from "@/lib/rbac";
import {
  handleRoute,
  jsonError,
  jsonOk,
  parseBody,
  unauthorized,
  forbidden,
} from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  parsePagination,
  paginationMeta,
  normalizeEmail,
  suppressionSchema,
} from "@/app/api/emails/shared";

// Suppression is a global, unowned list: it cannot be scoped to
// assigned records, so the whole list (read + write) requires
// EMAILS=ALL. Unsubscribes recorded through an email status change
// still work internally (see emails shared ensureSuppressed).
export async function GET(request: Request): Promise<NextResponse> {
  return handleRoute(async () => {
    const access = await moduleAccess("EMAILS");
    if (!access.ok) return access.reason === "unauthenticated" ? unauthorized() : forbidden();
    const user = access.user;
    const level = access.level;
    if (level !== "ALL") return forbidden("Suppression requires full email access");
    const params = new URL(request.url).searchParams;
    const { page, limit } = parsePagination(params);
    const search = params.get("search")?.trim().toLowerCase() ?? "";

    const where: Prisma.SuppressionWhereInput = {};
    if (search) where.email = { contains: search, mode: "insensitive" };

    const [total, items] = await prisma.$transaction([
      prisma.suppression.count({ where }),
      prisma.suppression.findMany({
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
    const access = await moduleAccess("EMAILS");
    if (!access.ok) return access.reason === "unauthenticated" ? unauthorized() : forbidden();
    const user = access.user;
    const level = access.level;
    if (level !== "ALL") return forbidden("Suppression requires full email access");
    const parsed = await parseBody(request, suppressionSchema);
    if ("error" in parsed) return parsed.error;

    const email = normalizeEmail(parsed.data.email);
    const existing = await prisma.suppression.findUnique({
      where: { email },
    });
    if (existing) return jsonError("This email is already on the list", 409);

    const row = await prisma.suppression.create({
      data: {
        email,
        reason: parsed.data.reason ?? undefined,
        scope: parsed.data.scope,
      },
    });
    await writeAudit(user.id, "SUPPRESSION_ADDED", "Suppression", row.id, {
      email: row.email,
      scope: row.scope,
    });
    return jsonOk(row, 201);
  });
}
