import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { contactSchema } from "@/lib/validation";
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
  canEditLead,
  companyScope,
  findDuplicateContact,
  isPrivileged,
  pickPresent,
} from "../../../_scope";

const patchSchema = contactSchema.omit({ companyId: true }).partial();

async function visibleContact(
  user: { id: string; role: string },
  companyId: string,
  contactId: string,
) {
  const company = await prisma.company.findFirst({
    where: { id: companyId, AND: [companyScope(user as never) as never] },
    select: { id: true, assignedToId: true },
  });
  if (!company) return null;
  const contact = await prisma.contact.findFirst({
    where: { id: contactId, companyId: company.id },
  });
  if (!contact) return null;
  return { company, contact };
}

export async function GET(
  _request: Request,
  { params }: { params: { id: string; contactId: string } },
): Promise<NextResponse> {
  return handleRoute(async () => {
    const user = await requireAuth();
    if (!user) return unauthorized();
    const found = await visibleContact(user, params.id, params.contactId);
    if (!found) return notFound("Contact not found");
    return jsonOk(found.contact);
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string; contactId: string } },
): Promise<NextResponse> {
  return handleRoute(async () => {
    const user = await requireAuth();
    if (!user) return unauthorized();
    const found = await visibleContact(user, params.id, params.contactId);
    if (!found) return notFound("Contact not found");
    if (!canEditLead(user, found.company))
      return forbidden("You cannot edit this contact");
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
    if (typeof data.email === "string") {
      const dup = await findDuplicateContact(found.company.id, data.email);
      if (dup && dup.id !== found.contact.id) {
        return NextResponse.json(
          {
            ok: false,
            error: "A contact with this email already exists at this company.",
            data: dup,
          },
          { status: 409 },
        );
      }
    }
    const clean: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      clean[key] = typeof value === "string" ? value.trim() || null : value;
    }
    if (typeof clean.fullName === "string")
      clean.fullName = (clean.fullName as string).trim();
    if (typeof clean.email === "string") clean.email = (clean.email as string).trim();
    const updated = await prisma.contact.update({
      where: { id: found.contact.id },
      data: clean,
    });
    await writeAudit(user.id, "CONTACT_UPDATED", "Contact", updated.id, {
      companyId: found.company.id,
      fullName: updated.fullName,
    });
    return jsonOk(updated);
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string; contactId: string } },
): Promise<NextResponse> {
  return handleRoute(async () => {
    const user = await requireAuth();
    if (!user) return unauthorized();
    const found = await visibleContact(user, params.id, params.contactId);
    if (!found) return notFound("Contact not found");
    if (!isPrivileged(user) && !canEditLead(user, found.company)) {
      return forbidden("You cannot delete this contact");
    }
    // Per RBAC matrix, delete is Admin-only; a Sales Executive who owns the
    // company may still not delete — enforce the stricter rule here.
    if (!isPrivileged(user)) {
      return forbidden("Only Admin / Super Admin delete contacts");
    }
    await prisma.contact.delete({ where: { id: found.contact.id } });
    await writeAudit(user.id, "CONTACT_DELETED", "Contact", found.contact.id, {
      companyId: found.company.id,
      fullName: found.contact.fullName,
    });
    return jsonOk({ deleted: true });
  });
}
