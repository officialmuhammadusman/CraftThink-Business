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
  unauthorized,
} from "@/lib/api";
import { pickPresent } from "../../companies/_scope";
import { QUOTE_INCLUDE, quoteScopeForLevel, withQuoteTotal, canEditQuote } from "../_helpers";

const patchSchema = quoteSchema.omit({ lineItems: true, dealId: true, companyId: true }).partial();

async function visible(user: { id: string }, level: string, id: string) {
  const item = await prisma.quote.findFirst({
    where: { id, AND: [quoteScopeForLevel(user as never, level as never) as never] },
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
  if (item) return item;
  const exists = await prisma.quote.findUnique({ where: { id }, select: { id: true } });
  return exists ? ("forbidden" as const) : null;
}

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  return handleRoute(async () => {
    const access = await moduleAccess("DEALS");
    if (!access.ok) return access.reason === "unauthenticated" ? unauthorized() : forbidden();
    const item = await visible(access.user, access.level, params.id);
    if (item === "forbidden") return forbidden();
    if (!item) return notFound("Quote not found");
    return jsonOk(withQuoteTotal(item));
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  return handleRoute(async () => {
    const access = await moduleAccess("DEALS");
    if (!access.ok) return access.reason === "unauthenticated" ? unauthorized() : forbidden();
    const user = access.user;
    const level = access.level;
    const item = await visible(user, level, params.id);
    if (item === "forbidden") return forbidden("You cannot edit this quote");
    if (!item) return notFound("Quote not found");
    // Quotes on a deleted deal (dealId null) stay editable only to ALL;
    // otherwise the caller must be in the deal's ASSIGNED scope.
    if (level !== "ALL") {
      if (!item.deal) return forbidden("You cannot edit this quote");
      if (!canEditQuote(user, item.deal)) return forbidden("You cannot edit this quote");
    }
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
    if (typeof clean.currency === "string") clean.currency = (clean.currency as string).trim();
    const updated = await prisma.quote.update({
      where: { id: item.id },
      data: clean,
      include: QUOTE_INCLUDE,
    });
    await writeAudit(user.id, "QUOTE_UPDATED", "Quote", updated.id, {
      dealId: updated.dealId,
      companyId: updated.companyId,
      status: updated.status,
    });
    return jsonOk(withQuoteTotal(updated));
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  return handleRoute(async () => {
    const access = await moduleAccess("DEALS");
    if (!access.ok) return access.reason === "unauthenticated" ? unauthorized() : forbidden();
    const user = access.user;
    const level = access.level;
    const item = await visible(user, level, params.id);
    if (item === "forbidden") return forbidden("You cannot delete this quote");
    if (!item) return notFound("Quote not found");
    if (level !== "ALL")
      return forbidden("Only users with full deal access delete quotes");
    await prisma.quote.delete({ where: { id: item.id } });
    await writeAudit(user.id, "QUOTE_DELETED", "Quote", item.id, {
      dealId: item.dealId,
      companyId: item.companyId,
      title: item.title,
    });
    return jsonOk({ deleted: true });
  });
}
