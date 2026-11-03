import { NextResponse } from "next/server";
import { moduleAccess } from "@/lib/rbac";
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
  pickPresent,
  projectScopeForLevel,
} from "../../companies/_scope";
import type { PermLevel } from "@/lib/rbac";
import { PROJECT_INCLUDE } from "../../_includes";

const patchSchema = projectSchema.omit({ companyId: true, dealId: true }).partial();

async function visible(user: { id: string }, id: string, level: PermLevel) {
  const item = await prisma.project.findFirst({
    where: { id, AND: [projectScopeForLevel(user as never, level) as never] },
    include: PROJECT_INCLUDE,
  });
  if (item) return item;
  const exists = await prisma.project.findUnique({ where: { id }, select: { id: true } });
  return exists ? ("forbidden" as const) : null;
}

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  return handleRoute(async () => {
    const access = await moduleAccess("PROJECTS");
    if (!access.ok) return access.reason === "unauthenticated" ? unauthorized() : forbidden();
    const user = access.user;
    const level = access.level;
    const item = await visible(user, params.id, level);
    if (item === "forbidden") return forbidden();
    if (!item) return notFound("Project not found");
    return jsonOk(item);
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  return handleRoute(async () => {
    const access = await moduleAccess("PROJECTS");
    if (!access.ok) return access.reason === "unauthenticated" ? unauthorized() : forbidden();
    const user = access.user;
    const level = access.level;
    const item = await visible(user, params.id, level);
    if (item === "forbidden") return forbidden("You cannot edit this project");
    if (!item) return notFound("Project not found");
    // Full project edits need full access or being the project manager.
    // A developer who can see the project (ASSIGNED scope) may not edit it.
    if (level !== "ALL" && item.managerId !== user.id)
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
    // ASSIGNED managers cannot hand their project to another manager.
    if (level === "ASSIGNED" && "managerId" in clean && clean.managerId !== user.id) {
      return forbidden("You may not reassign this project to another manager");
    }
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
    const access = await moduleAccess("PROJECTS");
    if (!access.ok) return access.reason === "unauthenticated" ? unauthorized() : forbidden();
    const user = access.user;
    const level = access.level;
    const item = await visible(user, params.id, level);
    if (item === "forbidden") return forbidden("You cannot delete this project");
    if (!item) return notFound("Project not found");
    if (level !== "ALL") return forbidden("Only users with full project access delete projects");
    await prisma.project.delete({ where: { id: item.id } });
    await writeAudit(user.id, "PROJECT_DELETED", "Project", item.id, {
      companyId: item.companyId,
      name: item.name,
    });
    return jsonOk({ deleted: true });
  });
}
