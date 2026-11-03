import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { handleRoute, unauthorized } from "@/lib/api";
import { companyScope } from "../_scope";

function csvCell(value: string | null | undefined): string {
  const text = value ?? "";
  if (/[",\n\r]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

/**
 * GET CSV download of the filtered company list (same filters as the list
 * endpoint). Scoped to the caller's visible companies; no email is sent.
 */
export async function GET(request: Request): Promise<NextResponse> {
  return handleRoute(async () => {
    const user = await requireAuth();
    if (!user) return unauthorized();
    const params = new URL(request.url).searchParams;
    const search = (params.get("search") ?? "").trim();
    const country = (params.get("country") ?? "").trim();
    const industry = (params.get("industry") ?? "").trim();
    const status = (params.get("status") ?? "").trim();
    const priority = (params.get("priority") ?? "").trim();
    const tag = (params.get("tag") ?? "").trim();
    const contacted = params.get("contacted") ?? "";
    const assignedTo = (params.get("assignedTo") ?? "").trim();

    const and: Record<string, unknown>[] = [companyScope(user)];
    if (search) {
      and.push({
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { website: { contains: search, mode: "insensitive" } },
          { city: { contains: search, mode: "insensitive" } },
        ],
      });
    }
    if (country) and.push({ country: { equals: country, mode: "insensitive" } });
    if (industry)
      and.push({ industry: { equals: industry, mode: "insensitive" } });
    if (status) and.push({ status: { equals: status, mode: "insensitive" } });
    if (priority)
      and.push({ priority: { equals: priority, mode: "insensitive" } });
    if (assignedTo) and.push({ assignedToId: assignedTo });
    if (tag)
      and.push({ tags: { some: { name: { equals: tag, mode: "insensitive" } } } });
    if (contacted === "true") and.push({ emailActivities: { some: {} } });
    if (contacted === "false") and.push({ emailActivities: { none: {} } });

    const companies = await prisma.company.findMany({
      where: { AND: and },
      include: {
        tags: { select: { name: true } },
        contacts: {
          orderBy: { createdAt: "asc" },
          select: { fullName: true, email: true, jobTitle: true, phone: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 5000,
    });

    const header = [
      "name",
      "website",
      "industry",
      "country",
      "city",
      "size",
      "linkedinUrl",
      "description",
      "source",
      "status",
      "priority",
      "tags",
      "contactName",
      "contactEmail",
      "contactJobTitle",
      "contactPhone",
    ];
    const lines = [header.join(",")];
    for (const c of companies) {
      const first = c.contacts[0];
      lines.push(
        [
          c.name,
          c.website,
          c.industry,
          c.country,
          c.city,
          c.size,
          c.linkedinUrl,
          c.description,
          c.source,
          c.status,
          c.priority,
          c.tags.map((t) => t.name).join("; "),
          first?.fullName,
          first?.email,
          first?.jobTitle,
          first?.phone,
        ]
          .map(csvCell)
          .join(","),
      );
    }
    const csv = lines.join("\r\n");
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="companies.csv"',
      },
    });
  });
}
