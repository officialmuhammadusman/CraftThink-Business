import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { contactSchema } from "@/lib/validation";
import { prisma } from "@/lib/prisma";
import {
  forbidden,
  handleRoute,
  jsonOk,
  notFound,
  parseBody,
  unauthorized,
} from "@/lib/api";
import {
  canCreateLead,
  canEditLead,
  companyScope,
  findDuplicateContact,
} from "../../_scope";

async function visibleCompany(user: { id: string; role: string }, companyId: string) {
  return prisma.company.findFirst({
    where: { id: companyId, AND: [companyScope(user as never) as never] },
    select: { id: true, name: true, assignedToId: true },
  });
}

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  return handleRoute(async () => {
    const user = await requireAuth();
    if (!user) return unauthorized();
    const company = await visibleCompany(user, params.id);
    if (!company) return notFound("Company not found");
    const contacts = await prisma.contact.findMany({
      where: { companyId: company.id },
      orderBy: { createdAt: "asc" },
    });
    return jsonOk({ items: contacts });
  });
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  return handleRoute(async () => {
    const user = await requireAuth();
    if (!user) return unauthorized();
    const company = await visibleCompany(user, params.id);
    if (!company) return notFound("Company not found");
    if (!canCreateLead(user) || !canEditLead(user, company)) {
      return forbidden("You cannot add contacts to this company");
    }
    const parsed = await parseBody(
      request,
      contactSchema.omit({ companyId: true }),
    );
    if ("error" in parsed) return parsed.error;
    const data = parsed.data;
    const dup = await findDuplicateContact(company.id, data.email);
    if (dup) {
      return NextResponse.json(
        {
          ok: false,
          error: "A contact with this email already exists at this company.",
          data: dup,
        },
        { status: 409 },
      );
    }
    try {
      const contact = await prisma.contact.create({
        data: {
          companyId: company.id,
          fullName: data.fullName.trim(),
          jobTitle: data.jobTitle?.trim() || null,
          email: data.email.trim(),
          linkedinUrl: data.linkedinUrl?.trim() || null,
          phone: data.phone?.trim() || null,
          isDecisionMaker: data.isDecisionMaker ?? false,
          notes: data.notes?.trim() || null,
        },
      });
      await writeAudit(user.id, "CONTACT_CREATED", "Contact", contact.id, {
        companyId: company.id,
        fullName: contact.fullName,
      });
      return jsonOk(contact, 201);
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code?: string }).code === "P2002"
      ) {
        const existing = await findDuplicateContact(company.id, data.email);
        return NextResponse.json(
          {
            ok: false,
            error: "A contact with this email already exists at this company.",
            data: existing,
          },
          { status: 409 },
        );
      }
      throw error;
    }
  });
}
