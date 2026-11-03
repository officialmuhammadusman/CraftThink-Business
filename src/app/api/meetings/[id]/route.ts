import { NextResponse } from "next/server";
import { moduleAccess } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { meetingSchema } from "@/lib/validation";
import { prisma } from "@/lib/prisma";
import {
  forbidden,
  handleRoute,
  jsonError,
  jsonOk,
  notFound,
  unauthorized,
} from "@/lib/api";
import { canEditLinked, meetingScopeForLevel, pickPresent } from "../../companies/_scope";
import type { PermLevel } from "@/lib/rbac";

const patchSchema = meetingSchema.omit({ companyId: true }).partial();

const INCLUDE = {
  company: { select: { id: true, name: true } },
  contact: { select: { id: true, fullName: true } },
  assignedTo: { select: { id: true, name: true, email: true } },
} as const;

async function visible(user: { id: string }, id: string, level: PermLevel) {
  const item = await prisma.meeting.findFirst({
    where: { id, AND: [meetingScopeForLevel(user as never, level) as never] },
    include: INCLUDE,
  });
  if (item) return item;
  const exists = await prisma.meeting.findUnique({
    where: { id },
    select: { id: true },
  });
  return exists ? ("forbidden" as const) : null;
}

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  return handleRoute(async () => {
    const access = await moduleAccess("MEETINGS");
    if (!access.ok) return access.reason === "unauthenticated" ? unauthorized() : forbidden();
    const user = access.user;
    const level = access.level;
    const item = await visible(user, params.id, level);
    if (item === "forbidden") return forbidden();
    if (!item) return notFound("Meeting not found");
    return jsonOk(item);
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  return handleRoute(async () => {
    const access = await moduleAccess("MEETINGS");
    if (!access.ok) return access.reason === "unauthenticated" ? unauthorized() : forbidden();
    const user = access.user;
    const level = access.level;
    const item = await visible(user, params.id, level);
    if (item === "forbidden") return forbidden("You cannot edit this meeting");
    if (!item) return notFound("Meeting not found");
    if (level !== "ALL" && !canEditLinked(user, item))
      return forbidden("You cannot edit this meeting");
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
      clean[key] = typeof value === "string" ? value.trim() || null : value;
    }
    if (typeof clean.title === "string") clean.title = (clean.title as string).trim();
    const updated = await prisma.meeting.update({
      where: { id: item.id },
      data: clean,
      include: INCLUDE,
    });
    await writeAudit(user.id, "MEETING_UPDATED", "Meeting", updated.id, {
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
    const access = await moduleAccess("MEETINGS");
    if (!access.ok) return access.reason === "unauthenticated" ? unauthorized() : forbidden();
    const user = access.user;
    const level = access.level;
    const item = await visible(user, params.id, level);
    if (item === "forbidden") return forbidden("You cannot delete this meeting");
    if (!item) return notFound("Meeting not found");
    if (level !== "ALL" && !canEditLinked(user, item)) {
      return forbidden("You cannot delete this meeting");
    }
    await prisma.meeting.delete({ where: { id: item.id } });
    await writeAudit(user.id, "MEETING_DELETED", "Meeting", item.id, {
      companyId: item.companyId,
    });
    return jsonOk({ deleted: true });
  });
}
