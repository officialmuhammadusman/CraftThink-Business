import { NextResponse } from "next/server";
import { moduleAccess } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { quoteLineItemSchema } from "@/lib/validation";
import { prisma } from "@/lib/prisma";
import {
  forbidden,
  handleRoute,
  jsonError,
  jsonOk,
  notFound,
  unauthorized,
} from "@/lib/api";
import { pickPresent } from "../../../../companies/_scope";
import { QUOTE_INCLUDE, quoteScopeForLevel, withQuoteTotal, canEditQuote } from "../../../_helpers";

async function editableLine(user: { id: string; role: string }, level: string, quoteId: string, lineId: string) {
  const quote = await prisma.quote.findFirst({
    where: { id: quoteId, AND: [quoteScopeForLevel(user as never, level as never) as never] },
    include: {
      deal: {
        select: {
          id: true,
          assignedToId: true,
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
  const line = await prisma.quoteLineItem.findFirst({
    where: { id: lineId, quoteId: quote.id },
  });
  if (!line) return null;
  return { quote, line };
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string; lineId: string } },
): Promise<NextResponse> {
  return handleRoute(async () => {
    const access = await moduleAccess("DEALS");
    if (!access.ok) return access.reason === "unauthenticated" ? unauthorized() : forbidden();
    const found = await editableLine(access.user, access.level, params.id, params.lineId);
    if (found === "forbidden") return forbidden("You cannot edit this quote");
    if (!found) return notFound("Line item not found");
    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return jsonError("Request body must be valid JSON", 400);
    }
    const parsed = quoteLineItemSchema.partial().safeParse(body);
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
      clean[key] = typeof value === "string" ? value.trim() : value;
    }
    await prisma.quoteLineItem.update({ where: { id: found.line.id }, data: clean });
    const updated = await prisma.quote.findUnique({
      where: { id: found.quote.id },
      include: QUOTE_INCLUDE,
    });
    await writeAudit(access.user.id, "QUOTE_LINE_UPDATED", "Quote", found.quote.id, {
      lineId: found.line.id,
    });
    return jsonOk(withQuoteTotal(updated!));
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string; lineId: string } },
): Promise<NextResponse> {
  return handleRoute(async () => {
    const access = await moduleAccess("DEALS");
    if (!access.ok) return access.reason === "unauthenticated" ? unauthorized() : forbidden();
    const found = await editableLine(access.user, access.level, params.id, params.lineId);
    if (found === "forbidden") return forbidden("You cannot edit this quote");
    if (!found) return notFound("Line item not found");
    await prisma.quoteLineItem.delete({ where: { id: found.line.id } });
    const updated = await prisma.quote.findUnique({
      where: { id: found.quote.id },
      include: QUOTE_INCLUDE,
    });
    await writeAudit(access.user.id, "QUOTE_LINE_DELETED", "Quote", found.quote.id, {
      lineId: found.line.id,
    });
    return jsonOk(withQuoteTotal(updated!));
  });
}
