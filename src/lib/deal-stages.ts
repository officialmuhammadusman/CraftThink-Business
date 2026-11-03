/**
 * Deal pipeline stage rules — the single documented standard.
 *
 * STAGE PROBABILITIES (display only, fixed — never per-deal invented):
 *   New Lead 10, Contacted 20, Follow-up 30, Interested 40,
 *   Meeting Scheduled 50, Meeting Completed 60, Proposal Sent 70,
 *   Negotiation 80, Won 100, Lost 0.
 * Weighted pipeline value = value × probability / 100, grouped by
 * currency (see src/lib/currency.ts — currencies are never mixed).
 *
 * STALE / ROTTING RULE (same on kanban cards and the list view):
 * an open deal (not WON/LOST) is stale when its expected-close day has
 * passed OR its updatedAt (fallback createdAt) is 30+ days old.
 *
 * STAGE EXIT CHECKS (enforced server-side in the move route and in
 * deal PATCH when the stage changes):
 *   PROPOSAL_SENT requires estimatedBudget OR finalPrice present.
 *   WON requires finalPrice present.
 * Accepting a quote does NOT move a deal stage — the user moves it
 * explicitly.
 */

export const DEAL_STAGES = [
  "NEW_LEAD",
  "CONTACTED",
  "FOLLOW_UP",
  "INTERESTED",
  "MEETING_SCHEDULED",
  "MEETING_COMPLETED",
  "PROPOSAL_SENT",
  "NEGOTIATION",
  "WON",
  "LOST",
] as const;

export type DealStage = (typeof DEAL_STAGES)[number];

export const DEAL_STAGE_LABELS: Record<DealStage, string> = {
  NEW_LEAD: "New Lead",
  CONTACTED: "Contacted",
  FOLLOW_UP: "Follow-up",
  INTERESTED: "Interested",
  MEETING_SCHEDULED: "Meeting Scheduled",
  MEETING_COMPLETED: "Meeting Completed",
  PROPOSAL_SENT: "Proposal Sent",
  NEGOTIATION: "Negotiation",
  WON: "Won",
  LOST: "Lost",
};

export const DEAL_STAGE_PROBABILITIES: Record<DealStage, number> = {
  NEW_LEAD: 10,
  CONTACTED: 20,
  FOLLOW_UP: 30,
  INTERESTED: 40,
  MEETING_SCHEDULED: 50,
  MEETING_COMPLETED: 60,
  PROPOSAL_SENT: 70,
  NEGOTIATION: 80,
  WON: 100,
  LOST: 0,
};

export function dealProbability(status: string): number {
  return (
    (DEAL_STAGE_PROBABILITIES as Record<string, number>)[status] ?? 0
  );
}

export function dealStageLabel(status: string): string {
  return (
    (DEAL_STAGE_LABELS as Record<string, string>)[status] ??
    status.replaceAll("_", " ")
  );
}

/** Server-side stage-exit check. Returns an error message or null. */
export function stageExitError(
  status: string,
  deal: { estimatedBudget: number | null; finalPrice: number | null },
): string | null {
  if (
    status === "PROPOSAL_SENT" &&
    deal.estimatedBudget == null &&
    deal.finalPrice == null
  ) {
    return "Cannot move to Proposal Sent: the deal needs a budget first — set an estimated budget or a final price.";
  }
  if (status === "WON" && deal.finalPrice == null) {
    return "Cannot move to Won: the deal needs a final price first.";
  }
  return null;
}

export type StaleDealInput = {
  status: string;
  expectedCloseDate: Date | string | null;
  updatedAt?: Date | string | null;
  createdAt?: Date | string | null;
};

/** Null when not stale; otherwise the human-readable stale reason. */
export function staleReason(deal: StaleDealInput): string | null {
  if (deal.status === "WON" || deal.status === "LOST") return null;
  if (deal.expectedCloseDate) {
    const close = new Date(deal.expectedCloseDate);
    close.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (close < today) return "Close date passed";
  }
  const ref = deal.updatedAt ?? deal.createdAt;
  if (ref) {
    const days = (Date.now() - new Date(ref).getTime()) / 86400000;
    if (days >= 30) return "No update in 30+ days";
  }
  return null;
}
