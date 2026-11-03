import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { handleRoute, jsonOk, unauthorized } from "@/lib/api";
import { prisma } from "@/lib/prisma";

// Reply statuses: a business counts as "replied" when any of its email
// activities is REPLIED, POSITIVE, or NEGATIVE. "Interested" means it has
// a POSITIVE activity (the tracking-only definition used by the dashboard
// filters — there is no sending engine behind this).
const REPLY_STATUSES = ["REPLIED", "POSITIVE", "NEGATIVE"] as const;

type GroupRow = {
  country: string;
  city: string;
  industry: string;
  discovered: number;
  contacted: number;
  notContacted: number;
};

/**
 * Coverage view: which places are covered and which businesses have been
 * sent cold email to — computed from real database records only.
 *
 * - contacted = has at least one EmailActivity record (any status).
 * - a business with no email activity counts as not-yet-contacted.
 * - contacted date = earliest email activity (sentAt when set, else createdAt).
 * - reply status = POSITIVE > NEGATIVE > REPLIED when present, else null.
 * - next follow-up = earliest due date among PENDING/OVERDUE follow-ups.
 *
 * All counts are 0 / lists empty on an empty database — nothing hardcoded.
 */
export async function GET(): Promise<NextResponse> {
  return handleRoute(async () => {
    const user = await getSessionUser();
    if (!user) return unauthorized();

    const companies = await prisma.company.findMany({
      orderBy: { name: "asc" },
      include: {
        emailActivities: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            subject: true,
            status: true,
            sentAt: true,
            createdAt: true,
            recipientEmail: true,
          },
        },
        followUps: {
          orderBy: { dueDate: "asc" },
          select: { id: true, dueDate: true, status: true, reason: true },
        },
      },
    });

    const groupMap = new Map<string, GroupRow>();
    const companyRows = companies.map((company) => {
      const contacted = company.emailActivities.length > 0;
      const firstActivity = company.emailActivities[0] ?? null;
      const statuses = company.emailActivities.map((e) => e.status);
      const replyStatus = statuses.includes("POSITIVE")
        ? "POSITIVE"
        : statuses.includes("NEGATIVE")
          ? "NEGATIVE"
          : statuses.includes("REPLIED")
            ? "REPLIED"
            : null;
      const hasReplied = statuses.some((s) =>
        (REPLY_STATUSES as readonly string[]).includes(s),
      );
      const openFollowUps = company.followUps.filter(
        (f) => f.status === "PENDING" || f.status === "OVERDUE",
      );
      const nextFollowUpDue =
        openFollowUps.length > 0
          ? openFollowUps[0].dueDate.toISOString()
          : null;

      const country = company.country ?? "Unknown";
      const city = company.city ?? "Unknown";
      const industry = company.industry ?? "Unknown";
      const key = JSON.stringify([country, city, industry]);
      const group = groupMap.get(key) ?? {
        country,
        city,
        industry,
        discovered: 0,
        contacted: 0,
        notContacted: 0,
      };
      group.discovered += 1;
      if (contacted) group.contacted += 1;
      else group.notContacted += 1;
      groupMap.set(key, group);

      return {
        id: company.id,
        name: company.name,
        website: company.website,
        country,
        city,
        industry,
        companyStatus: company.status,
        contacted,
        contactedDate: firstActivity
          ? (firstActivity.sentAt ?? firstActivity.createdAt).toISOString()
          : null,
        emailsSent: company.emailActivities.length,
        emails: company.emailActivities.map((e) => ({
          id: e.id,
          subject: e.subject,
          status: e.status,
          recipientEmail: e.recipientEmail,
          date: (e.sentAt ?? e.createdAt).toISOString(),
        })),
        replyStatus,
        hasReplied,
        interested: statuses.includes("POSITIVE"),
        nextFollowUpDue,
        followUps: company.followUps.map((f) => ({
          id: f.id,
          dueDate: f.dueDate.toISOString(),
          status: f.status,
          reason: f.reason,
        })),
      };
    });

    const groups = [...groupMap.values()].sort((a, b) => {
      if (a.country !== b.country) return a.country.localeCompare(b.country);
      if (a.city !== b.city) return a.city.localeCompare(b.city);
      return a.industry.localeCompare(b.industry);
    });

    const totals = {
      discovered: companyRows.length,
      contacted: companyRows.filter((c) => c.contacted).length,
      notContacted: companyRows.filter((c) => !c.contacted).length,
      replied: companyRows.filter((c) => c.hasReplied).length,
      interested: companyRows.filter((c) => c.interested).length,
    };

    return jsonOk({ totals, groups, companies: companyRows });
  });
}
