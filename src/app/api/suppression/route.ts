import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/rbac";
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
  canManageOutreach,
  suppressionSchema,
} from "@/app/api/emails/shared";

// List: every signed-in user may check the list (the enforcement that
// matters — import skip and unsubscribe handling — is server-side).
// Adding is allowed for Super Admin, Admin, and Sales Executive
// (recording an unsubscribe/bounce for their own contacts).
export async function GET(request: Request): Promise<NextResponse> {
  return handleRoute(async () => {
    const user = await requireAuth();
    if (!user) return unauthorized();
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
    const user = await requireAuth();
    if (!user) return unauthorized();
    if (!canManageOutreach(user)) return forbidden();
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
