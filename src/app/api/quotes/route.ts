import { NextResponse } from "next/server";
import { moduleAccess } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { quoteSchema } from "@/lib/validation";
import { prisma } from "@/lib/prisma";
import {
  forbidden,
  handleRoute,
  jsonError,
  jsonOk,
  notFound,
  parseBody,
  unauthorized,
} from "@/lib/api";
import { dealScopeForLevel, paginationMeta, parsePagination } from "../companies/_scope";
import { QUOTE_INCLUDE, quoteScopeForLevel, withQuoteTotal } from "./_helpers";

/**
 * Quotes — permission module DEALS (see _helpers.ts). List filters:
 * dealId, companyId, status, currency. Totals are computed server-side
 * from line items on every read (never hand-typed, never stored).
 * Accepting a quote does NOT change the deal stage — the user moves
 * the deal explicitly via the deals move route.
 */
export async function GET(request: Request): Promise<NextResponse> {
  return handleRoute(async () => {
    const access = await moduleAccess("DEALS");
    if (!access.ok) return access.reason === "unauthenticated" ? unauthorized() : forbidden();
    const user = access.user;
    const level = access.level;
    const params = new URL(request.url).searchParams;
    const { page, limit, skip } = parsePagination(request);
    const dealId = (params.get("dealId") ?? "").trim();
    const companyId = (params.get("companyId") ?? "").trim();
    const status = (params.get("status") ?? "").trim();
    const currency = (params.get("currency") ?? "").trim();
    const and: Record<string, unknown>[] = [quoteScopeForLevel(user, level)];
    if (dealId) and.push({ dealId });
    if (companyId) and.push({ companyId });
    if (status) and.push({ status });
    if (currency) and.push({ currency: { equals: currency, mode: "insensitive" } });
    const where = { AND: and };
    const [items, total] = await Promise.all([
      prisma.quote.findMany({
        where: where as never,
        include: QUOTE_INCLUDE,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.quote.count({ where: where as never }),
    ]);
    return jsonOk({
      items: items.map(withQuoteTotal),
      pagination: paginationMeta(total, page, limit),
    });
  });
}

export async function POST(request: Request): Promise<NextResponse> {
  return handleRoute(async () => {
    const access = await moduleAccess("DEALS");
    if (!access.ok) return access.reason === "unauthenticated" ? unauthorized() : forbidden();
    const user = access.user;
    const level = access.level;
    const parsed = await parseBody(request, quoteSchema);
    if ("error" in parsed) return parsed.error;
    const data = parsed.data;

    // A quote needs a deal to attach to; companyId is denormalised
    // from that deal so quotes stay listable per company even if the
    // deal is later deleted (dealId SetNull, company link survives).
    let deal = null;
    if (data.dealId) {
      deal = await prisma.deal.findFirst({
        where: { id: data.dealId, AND: [dealScopeForLevel(user, level) as never] },
        select: { id: true, companyId: true, assignedToId: true },
      });
      if (!deal) {
        const exists = await prisma.deal.findUnique({ where: { id: data.dealId }, select: { id: true } });
        if (exists) return forbidden("You cannot create quotes for this deal");
        return notFound("Deal not found");
      }
    }
    const companyId = deal?.companyId ?? data.companyId ?? null;
    if (!companyId) return jsonError("A quote needs a deal (or a company)", 422);
    if (!deal && data.companyId) {
      const company = await prisma.company.findUnique({
        where: { id: data.companyId },
        select: { id: true },
      });
      if (!company) return notFound("Company not found");
    }

    const item = await prisma.quote.create({
      data: {
        dealId: deal?.id ?? null,
        companyId,
        title: data.title.trim(),
        currency: data.currency ?? "USD",
        status: data.status ?? "DRAFT",
        notes: data.notes?.trim() || null,
        createdById: user.id,
        lineItems:
          data.lineItems && data.lineItems.length > 0
            ? {
                create: data.lineItems.map((li, i) => ({
                  description: li.description.trim(),
                  quantity: li.quantity,
                  unitPrice: li.unitPrice,
                  position: li.position ?? i,
                })),
              }
            : undefined,
      },
      include: QUOTE_INCLUDE,
    });
    await writeAudit(user.id, "QUOTE_CREATED", "Quote", item.id, {
      dealId: item.dealId,
      companyId: item.companyId,
      title: item.title,
      status: item.status,
    });
    return jsonOk(withQuoteTotal(item), 201);
  });
}
