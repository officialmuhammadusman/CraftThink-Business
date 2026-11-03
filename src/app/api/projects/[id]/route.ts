import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { projectSchema } from "@/lib/validation";
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
  canManageProject,
  isPrivileged,
  pickPresent,
  projectScope,
} from "../../companies/_scope";
import { PROJECT_INCLUDE } from "../../_includes";

const patchSchema = projectSchema.omit({ companyId: true, dealId: true }).partial();

async function visible(user: { id: string; role: string }, id: string) {
  return prisma.project.findFirst({
    where: { id, AND: [projectScope(user as never) as never] },
    include: PROJECT_INCLUDE,
  });
}

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  return handleRoute(async () => {
    const user = await requireAuth();
    if (!user) return unauthorized();
    const item = await visible(user, params.id);
    if (!item) return notFound("Project not found");
    return jsonOk(item);
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  return handleRoute(async () => {
    const user = await requireAuth();
    if (!user) return unauthorized();
    const item = await visible(user, params.id);
    if (!item) return notFound("Project not found");
    if (!canManageProject(user, item))
      return forbidden("You cannot edit this project");
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
    const clean: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      if (key === "techStack" || key === "developerIds") continue;
      clean[key] = typeof value === "string" ? value.trim() || null : value;
    }
    if (typeof clean.name === "string") clean.name = (clean.name as string).trim();
    // Non-admin PMs cannot hand their project to another manager.
    if (!isPrivileged(user) && "managerId" in clean) clean.managerId = user.id;
    const updateData: Record<string, unknown> = { ...clean };
    if ("developerIds" in data && Array.isArray(data.developerIds)) {
      const developerIds = [...new Set(data.developerIds.map((d) => String(d).trim()).filter(Boolean))];
      const found = await prisma.user.findMany({
        where: { id: { in: developerIds }, active: true },
        select: { id: true },
      });
      if (found.length !== developerIds.length)
        return notFound("One or more assigned developers were not found");
      updateData.developers = { set: developerIds.map((id) => ({ id })) };
    }
    if ("techStack" in data && Array.isArray(data.techStack)) {
      updateData.techStack = data.techStack.map((t) => String(t).trim()).filter(Boolean);
    }
    const updated = await prisma.project.update({
      where: { id: item.id },
      data: updateData as never,
      include: PROJECT_INCLUDE,
    });
    await writeAudit(user.id, "PROJECT_UPDATED", "Project", updated.id, {
      companyId: updated.companyId,
      status: updated.status,
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
    const item = await visible(user, params.id);
    if (!item) return notFound("Project not found");
    if (!isPrivileged(user)) return forbidden("Only admins delete projects");
    await prisma.project.delete({ where: { id: item.id } });
    await writeAudit(user.id, "PROJECT_DELETED", "Project", item.id, {
      companyId: item.companyId,
      name: item.name,
    });
    return jsonOk({ deleted: true });
  });
}
