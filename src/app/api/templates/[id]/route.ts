import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/rbac";
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
import { isAdmin, canManageOutreach } from "@/app/api/emails/shared";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  return handleRoute(async () => {
    const user = await requireAuth();
    if (!user) return unauthorized();
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
    const user = await requireAuth();
    if (!user) return unauthorized();
    if (!canManageOutreach(user)) return forbidden();
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
    const user = await requireAuth();
    if (!user) return unauthorized();
    // RBAC matrix: template deletion is Admin-only, so live campaigns
    // are not broken by a seller deleting a shared template.
    if (!isAdmin(user)) return forbidden();
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
