import type { SessionUser } from "@/lib/auth";
import { dealScopeForLevel } from "../companies/_scope";
import type { PermLevel } from "@/lib/rbac";

/**
 * Quote helpers. Permission module is DEALS: quotes belong to deals, so
 * a quote is visible/editable exactly when its deal is visible under
 * the caller's DEALS grant (ASSIGNED = deal assigned to them or on a
 * company assigned to them; ALL = any deal). This choice is documented
 * in README.md — no new module was added to the grant matrix.
 */

export const QUOTE_INCLUDE = {
  deal: { select: { id: true, title: true, status: true, assignedToId: true, companyId: true } },
  company: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true, email: true } },
  lineItems: { orderBy: { position: "asc" as const } },
} as const;

/** Prisma where clause scoping quotes through their deal's DEALS scope. */
export function quoteScopeForLevel(
  user: SessionUser,
  level: PermLevel,
) {
  if (level === "ALL") return {};
  if (level === "ASSIGNED")
    return { deal: dealScopeForLevel(user, level) as never };
  return { id: "__no_access__" };
}

/** Total is NEVER stored: sum(quantity × unitPrice) over line items. */
export function quoteTotal(
  lineItems: { quantity: number; unitPrice: number }[],
): number {
  return lineItems.reduce((sum, li) => sum + li.quantity * li.unitPrice, 0);
}

export function withQuoteTotal<T extends { lineItems: { quantity: number; unitPrice: number }[] }>(
  quote: T,
): T & { total: number } {
  return { ...quote, total: quoteTotal(quote.lineItems) };
}

/** ASSIGNED callers may edit only quotes on deals in their scope. */
export function canEditQuote(
  user: SessionUser,
  deal: { assignedToId: string | null; company: { assignedToId: string | null } },
): boolean {
  if (user.role === "SUPER_ADMIN") return true;
  if (deal.assignedToId === user.id) return true;
  if (deal.company.assignedToId === user.id) return true;
  return false;
}
