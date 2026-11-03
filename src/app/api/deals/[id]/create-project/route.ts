import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/rbac";
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
import { dealScope, isPrivileged } from "../../../companies/_scope";

const bodySchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  managerId: z.string().optional().nullable(),
  description: z.string().trim().max(2000).optional().nullable(),
});

/**
 * Explicit won-deal → project conversion. The UI must ask
 * "Create project from this deal?" first; this endpoint never runs
 * automatically and never runs for a non-WON deal. A second call for the
 * same deal returns the existing project with 409 instead of duplicating.
 */
export async function POST(
  request: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  return handleRoute(async () => {
    const user = await requireAuth();
    if (!user) return unauthorized();
    const deal = await prisma.deal.findFirst({
      where: { id: params.id, AND: [dealScope(user) as never] },
      include: { projects: true },
    });
    if (!deal) return notFound("Deal not found");
    const mayConvert =
      isPrivileged(user) ||
      user.role === "PROJECT_MANAGER" ||
      deal.assignedToId === user.id;
    if (!mayConvert) {
      return forbidden("Only Admins, Project Managers or the deal owner convert a deal");
    }
    if (deal.status !== "WON") {
      return jsonError("Only a WON deal can be converted into a project", 409);
    }
    if (deal.projects.length > 0) {
      return NextResponse.json(
        {
          ok: false,
          error: "This deal already has a project.",
          data: deal.projects[0],
        },
        { status: 409 },
      );
    }
    let body: unknown = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return jsonError(
        first ? `${first.path.join(".") || "body"}: ${first.message}` : "Invalid body",
        422,
      );
    }
    const project = await prisma.project.create({
      data: {
        dealId: deal.id,
        companyId: deal.companyId,
        name: parsed.data.name?.trim() || deal.title,
        description: parsed.data.description?.trim() || deal.notes || null,
        budget: deal.finalPrice ?? deal.estimatedBudget ?? null,
        managerId:
          parsed.data.managerId?.trim() ||
          (user.role === "PROJECT_MANAGER" ? user.id : null) ||
          deal.assignedToId ||
          null,
        status: "PLANNING",
        techStack: [],
      },
    });
    await writeAudit(user.id, "PROJECT_CREATED", "Project", project.id, {
      companyId: deal.companyId,
      dealId: deal.id,
      name: project.name,
    });
    await writeAudit(user.id, "DEAL_CONVERTED_TO_PROJECT", "Deal", deal.id, {
      companyId: deal.companyId,
      projectId: project.id,
    });
    return jsonOk(project, 201);
  });
}
