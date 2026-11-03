import { NextResponse } from "next/server";
import { moduleAccess } from "@/lib/rbac";
import {
  handleRoute,
  jsonOk,
  parseBody,
  unauthorized,
  forbidden,
  notFound,
} from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { templateSchema } from "@/lib/validation";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  return handleRoute(async () => {
    const access = await moduleAccess("TEMPLATES");
    if (!access.ok) return access.reason === "unauthenticated" ? unauthorized() : forbidden();
    const user = access.user;
    const level = access.level;
    const template = await prisma.emailTemplate.findUnique({
      where: { id: params.id },
    });
    if (!template) return notFound("Template not found");
    return jsonOk(template);
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  return handleRoute(async () => {
    const access = await moduleAccess("TEMPLATES");
    if (!access.ok) return access.reason === "unauthenticated" ? unauthorized() : forbidden();
    const user = access.user;
    const level = access.level;
    if (level !== "ALL") return forbidden("Only users with full template access may edit templates");
    const parsed = await parseBody(request, templateSchema.partial());
    if ("error" in parsed) return parsed.error;

    const existing = await prisma.emailTemplate.findUnique({
      where: { id: params.id },
    });
    if (!existing) return notFound("Template not found");

    const data: Record<string, unknown> = {};
    if (parsed.data.name !== undefined) data.name = parsed.data.name;
    if (parsed.data.industry !== undefined)
      data.industry = parsed.data.industry ?? null;
    if (parsed.data.subject !== undefined) data.subject = parsed.data.subject;
    if (parsed.data.body !== undefined) data.body = parsed.data.body;

    const updated = await prisma.emailTemplate.update({
      where: { id: params.id },
      data: { ...data },
    });
    await writeAudit(user.id, "TEMPLATE_UPDATED", "EmailTemplate", updated.id, {
      name: updated.name,
    });
    return jsonOk(updated);
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  return handleRoute(async () => {
    const access = await moduleAccess("TEMPLATES");
    if (!access.ok) return access.reason === "unauthenticated" ? unauthorized() : forbidden();
    const user = access.user;
    const level = access.level;
    // Template deletion requires ALL, so a member cannot break shared
    // templates used by others.
    if (level !== "ALL") return forbidden();
    const existing = await prisma.emailTemplate.findUnique({
      where: { id: params.id },
    });
    if (!existing) return notFound("Template not found");

    // Activities survive: their template FK is SetNull in the schema.
    await prisma.emailTemplate.delete({ where: { id: params.id } });
    await writeAudit(user.id, "TEMPLATE_DELETED", "EmailTemplate", params.id, {
      name: existing.name,
    });
    return jsonOk({ deleted: true });
  });
}
