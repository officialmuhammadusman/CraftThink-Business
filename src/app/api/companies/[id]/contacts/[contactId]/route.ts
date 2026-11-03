import { NextResponse } from "next/server";
import { moduleAccess } from "@/lib/rbac";
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
  companyScopeForLevel,
  findDuplicateContact,
  pickPresent,
} from "../../../_scope";
import type { PermLevel } from "@/lib/rbac";

const patchSchema = contactSchema.omit({ companyId: true }).partial();

async function visibleContact(
  user: { id: string },
  companyId: string,
  contactId: string,
  level: PermLevel,
) {
  const company = await prisma.company.findFirst({
    where: { id: companyId, AND: [companyScopeForLevel(user as never, level) as never] },
    select: { id: true, assignedToId: true },
  });
  if (!company) {
    const exists = await prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true },
    });
    if (exists) return "forbidden" as const;
    return null;
  }
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
    const access = await moduleAccess("COMPANIES");
    if (!access.ok) return access.reason === "unauthenticated" ? unauthorized() : forbidden();
    const user = access.user;
    const level = access.level;
    const found = await visibleContact(user, params.id, params.contactId, level);
    if (found === "forbidden") return forbidden();
    if (!found) return notFound("Contact not found");
    return jsonOk(found.contact);
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string; contactId: string } },
): Promise<NextResponse> {
  return handleRoute(async () => {
    const access = await moduleAccess("COMPANIES");
    if (!access.ok) return access.reason === "unauthenticated" ? unauthorized() : forbidden();
    const user = access.user;
    const level = access.level;
    const found = await visibleContact(user, params.id, params.contactId, level);
    if (found === "forbidden") return forbidden("You cannot edit this contact");
    if (!found) return notFound("Contact not found");
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
    const access = await moduleAccess("COMPANIES");
    if (!access.ok) return access.reason === "unauthenticated" ? unauthorized() : forbidden();
    const user = access.user;
    const level = access.level;
    const found = await visibleContact(user, params.id, params.contactId, level);
    if (found === "forbidden") return forbidden("You cannot delete this contact");
    if (!found) return notFound("Contact not found");
    // Contact deletion requires full company access.
    if (level !== "ALL") {
      return forbidden("Only users with full company access delete contacts");
    }
    await prisma.contact.delete({ where: { id: found.contact.id } });
    await writeAudit(user.id, "CONTACT_DELETED", "Contact", found.contact.id, {
      companyId: found.company.id,
      fullName: found.contact.fullName,
    });
    return jsonOk({ deleted: true });
  });
}
