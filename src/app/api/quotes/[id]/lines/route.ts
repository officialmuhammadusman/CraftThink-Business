import { NextResponse } from "next/server";
import { moduleAccess } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { quoteLineItemSchema } from "@/lib/validation";
import { prisma } from "@/lib/prisma";
import {
  forbidden,
  handleRoute,
  jsonOk,
  notFound,
  parseBody,
  unauthorized,
} from "@/lib/api";
import { QUOTE_INCLUDE, quoteScopeForLevel, withQuoteTotal, canEditQuote } from "../../_helpers";

async function editableQuote(user: { id: string; role: string }, level: string, quoteId: string) {
  const quote = await prisma.quote.findFirst({
    where: { id: quoteId, AND: [quoteScopeForLevel(user as never, level as never) as never] },
    include: {
      ...QUOTE_INCLUDE,
      deal: {
        select: {
          id: true,
          title: true,
          status: true,
          assignedToId: true,
          companyId: true,
          company: { select: { assignedToId: true } },
        },
      },
    },
  });
  if (!quote) {
    const exists = await prisma.quote.findUnique({ where: { id: quoteId }, select: { id: true } });
    return exists ? ("forbidden" as const) : null;
  }
  if (level !== "ALL") {
    if (!quote.deal) return "forbidden" as const;
    if (!canEditQuote(user as never, quote.deal)) return "forbidden" as const;
  }
  return quote;
}

/** POST /api/quotes/[id]/lines — add a line item; total recomputes on read. */
export async function POST(
  request: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  return handleRoute(async () => {
    const access = await moduleAccess("DEALS");
    if (!access.ok) return access.reason === "unauthenticated" ? unauthorized() : forbidden();
    const parsed = await parseBody(request, quoteLineItemSchema);
    if ("error" in parsed) return parsed.error;
    const quote = await editableQuote(access.user, access.level, params.id);
    if (quote === "forbidden") return forbidden("You cannot edit this quote");
    if (!quote) return notFound("Quote not found");
    const data = parsed.data;
    await prisma.quoteLineItem.create({
      data: {
        quoteId: quote.id,
        description: data.description.trim(),
        quantity: data.quantity,
        unitPrice: data.unitPrice,
        position: data.position ?? quote.lineItems.length,
      },
    });
    const updated = await prisma.quote.findUnique({
      where: { id: quote.id },
      include: QUOTE_INCLUDE,
    });
    await writeAudit(access.user.id, "QUOTE_LINE_ADDED", "Quote", quote.id, {
      description: data.description.trim(),
    });
    return jsonOk(withQuoteTotal(updated!), 201);
  });
}
