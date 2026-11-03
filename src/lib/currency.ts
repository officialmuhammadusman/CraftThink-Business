/**
 * Multi-currency helpers. Rule: NEVER mix currencies in one total.
 * Every total is grouped BY currency; a deal/quote with no (or empty)
 * currency lands in the "Unspecified" group, never merged into another
 * currency's total.
 */

// ISO codes offered in currency Selects (company, contact, deal, quote).
// The schema stores a free string (max 10 chars), so other ISO codes
// entered elsewhere still work — they just group under their own code.
export const SUPPORTED_CURRENCIES = [
  "USD",
  "EUR",
  "GBP",
  "AED",
  "SAR",
  "PKR",
] as const;

export const UNSPECIFIED_CURRENCY = "Unspecified";

/** Normalise a stored currency value into its display group key. */
export function currencyGroupKey(currency: string | null | undefined): string {
  const code = (currency ?? "").trim().toUpperCase();
  return code || UNSPECIFIED_CURRENCY;
}

export type CurrencyTotal = { currency: string; value: number };

/**
 * Sum `valueOf` per currency group, in first-seen order. Items with a
 * null/undefined value are skipped (no invented amounts).
 */
export function groupTotalsByCurrency<T>(
  items: T[],
  currencyOf: (item: T) => string | null | undefined,
  valueOf: (item: T) => number | null | undefined,
): CurrencyTotal[] {
  const totals = new Map<string, number>();
  for (const item of items) {
    const value = valueOf(item);
    if (value == null || Number.isNaN(value)) continue;
    const key = currencyGroupKey(currencyOf(item));
    totals.set(key, (totals.get(key) ?? 0) + value);
  }
  return [...totals.entries()].map(([currency, value]) => ({
    currency,
    value,
  }));
}

/** "USD 12,000 · EUR 8,500" — one labelled total per currency. */
export function formatCurrencyTotals(totals: CurrencyTotal[]): string {
  if (totals.length === 0) return "—";
  return totals
    .map(
      ({ currency, value }) =>
        `${currency} ${value.toLocaleString(undefined, {
          minimumFractionDigits: 0,
          maximumFractionDigits: 2,
        })}`,
    )
    .join(" · ");
}
