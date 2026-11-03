import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import {
  getPermissionMap,
  assignedCompanyWhere,
  assignedEmailWhere,
  assignedFollowUpWhere,
  assignedDealWhere,
} from "@/lib/rbac";
import { handleRoute, jsonOk, unauthorized, forbidden } from "@/lib/api";
import { prisma } from "@/lib/prisma";

// Read-only chart data for the professional dashboard. Same permission
// scoping as /api/dashboard/stats: NONE contributes nothing, ASSIGNED only
// assigned rows, ALL everything. A user with no grant at all gets 403.
// Every number comes from the database; empty data returns empty arrays,
// never invented trends.
const SENT_STATUSES = [
  "SENT",
  "DELIVERED",
  "REPLIED",
  "POSITIVE",
  "NEGATIVE",
  "FOLLOW_UP_REQUIRED",
] as const;

const RESPONSE_STATUSES = ["REPLIED", "POSITIVE", "NEGATIVE"] as const;

const DEAL_STAGE_LABELS: Record<string, string> = {
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

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parseDateParam(v: string | null): Date | null {
  if (!v) return null;
  const [y, m, d] = v.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

export async function GET(req: Request): Promise<NextResponse> {
  return handleRoute(async () => {
    const user = await getSessionUser();
    if (!user) return unauthorized();
    const perms = await getPermissionMap(user.id);
    const anyAccess = Object.values(perms).some((l) => l !== "NONE");
    if (!anyAccess) return forbidden();

    const url = new URL(req.url);
    const now = new Date();
    const defaultFrom = new Date(now);
    defaultFrom.setDate(defaultFrom.getDate() - 29);
    defaultFrom.setHours(0, 0, 0, 0);
    const from = parseDateParam(url.searchParams.get("from")) ?? defaultFrom;
    const toRaw = parseDateParam(url.searchParams.get("to"));
    const to = toRaw ?? now;
    to.setHours(23, 59, 59, 999);

    const companyWhere =
      perms.COMPANIES === "NONE"
        ? { id: "__no_access__" }
        : perms.COMPANIES === "ALL"
          ? {}
          : assignedCompanyWhere(user.id);
    const emailWhere =
      perms.EMAILS === "NONE"
        ? { id: "__no_access__" }
        : perms.EMAILS === "ALL"
          ? {}
          : assignedEmailWhere(user.id);
    const followUpWhere =
      perms.FOLLOW_UPS === "NONE"
        ? { id: "__no_access__" }
        : perms.FOLLOW_UPS === "ALL"
          ? {}
          : assignedFollowUpWhere(user.id);
    const dealWhere =
      perms.DEALS === "NONE"
        ? { id: "__no_access__" }
        : perms.DEALS === "ALL"
          ? {}
          : assignedDealWhere(user.id);

    const [emails, companies, deals, followUps] = await Promise.all([
      prisma.emailActivity.findMany({
        where: {
          AND: [emailWhere, { status: { in: [...SENT_STATUSES] } }],
        } as never,
        select: { companyId: true, status: true, sentAt: true, createdAt: true },
      }),
      prisma.company.findMany({
        where: companyWhere as never,
        select: { country: true, industry: true },
      }),
      prisma.deal.findMany({
        where: dealWhere as never,
        select: {
          status: true,
          finalPrice: true,
          estimatedBudget: true,
          expectedCloseDate: true,
          createdAt: true,
        },
      }),
      prisma.followUp.findMany({
        where: { AND: [followUpWhere, { status: "PENDING" }] } as never,
        select: { dueDate: true },
      }),
    ]);

    // Emails sent over time: daily buckets across the requested range.
    const buckets: { label: string; value: number }[] = [];
    const cursor = new Date(from);
    cursor.setHours(0, 0, 0, 0);
    const end = new Date(to);
    end.setHours(0, 0, 0, 0);
    while (cursor <= end && buckets.length <= 370) {
      buckets.push({ label: dayKey(cursor), value: 0 });
      cursor.setDate(cursor.getDate() + 1);
    }
    const bucketIndex = new Map(buckets.map((b, i) => [b.label, i]));
    for (const e of emails) {
      const d = e.sentAt ?? e.createdAt;
      const key = dayKey(d);
      const i = bucketIndex.get(key);
      if (i !== undefined) buckets[i].value += 1;
    }

    // Response funnel: distinct companies at each stage.
    const contacted = new Set<string>();
    const replied = new Set<string>();
    const positive = new Set<string>();
    for (const e of emails) {
      contacted.add(e.companyId);
      if ((RESPONSE_STATUSES as readonly string[]).includes(e.status)) {
        replied.add(e.companyId);
      }
      if (e.status === "POSITIVE") positive.add(e.companyId);
    }
    const funnel = [
      { label: "Contacted", value: contacted.size },
      { label: "Replied", value: replied.size },
      { label: "Positive", value: positive.size },
    ];

    const groupTop = (
      items: (string | null | undefined)[],
      limit = 8,
    ): { label: string; value: number }[] => {
      const counts = new Map<string, number>();
      for (const item of items) {
        const key = (item ?? "").trim() || "Unknown";
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      return [...counts.entries()]
        .map(([label, value]) => ({ label, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, limit);
    };

    const dealsByStage = Object.entries(
      deals.reduce<Record<string, number>>((acc, d) => {
        acc[d.status] = (acc[d.status] ?? 0) + 1;
        return acc;
      }, {}),
    ).map(([status, value]) => ({
      label: DEAL_STAGE_LABELS[status] ?? status,
      value,
    }));

    // Follow-ups due by day: next 14 days from today.
    const fuBuckets: { label: string; value: number }[] = [];
    const fuCursor = new Date(now);
    fuCursor.setHours(0, 0, 0, 0);
    for (let i = 0; i < 14; i++) {
      fuBuckets.push({ label: dayKey(fuCursor), value: 0 });
      fuCursor.setDate(fuCursor.getDate() + 1);
    }
    const fuIndex = new Map(fuBuckets.map((b, i) => [b.label, i]));
    for (const f of followUps) {
      const i = fuIndex.get(dayKey(f.dueDate));
      if (i !== undefined) fuBuckets[i].value += 1;
    }

    // Won revenue: only when won deals actually carry a budget figure.
    const wonWithBudget = deals.filter(
      (d) =>
        d.status === "WON" &&
        (d.finalPrice != null || d.estimatedBudget != null),
    );
    let wonRevenue: { label: string; value: number }[] | null = null;
    if (wonWithBudget.length > 0) {
      const byMonth = new Map<string, number>();
      for (const d of wonWithBudget) {
        const date = d.expectedCloseDate ?? d.createdAt;
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
        byMonth.set(
          key,
          (byMonth.get(key) ?? 0) +
            (d.finalPrice ?? d.estimatedBudget ?? 0),
        );
      }
      wonRevenue = [...byMonth.entries()]
        .map(([label, value]) => ({ label, value }))
        .sort((a, b) => a.label.localeCompare(b.label));
    }

    return jsonOk({
      range: { from: dayKey(from), to: dayKey(to) },
      emailsOverTime: buckets,
      funnel,
      leadsByCountry: groupTop(companies.map((c) => c.country)),
      leadsByIndustry: groupTop(companies.map((c) => c.industry)),
      dealsByStage,
      followUpsDueByDay: fuBuckets,
      wonRevenue,
    });
  });
}
