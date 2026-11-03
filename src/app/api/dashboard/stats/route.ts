import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { handleRoute, jsonOk, unauthorized } from "@/lib/api";
import { prisma } from "@/lib/prisma";

// Email statuses that mean an email actually left the system.
const SENT_STATUSES = [
  "SENT",
  "DELIVERED",
  "REPLIED",
  "POSITIVE",
  "NEGATIVE",
  "FOLLOW_UP_REQUIRED",
] as const;

const RESPONSE_STATUSES = ["REPLIED", "POSITIVE", "NEGATIVE"] as const;

const ACTIVE_PROJECT_STATUSES = [
  "PLANNING",
  "IN_PROGRESS",
  "REVIEW",
  "TESTING",
] as const;

/**
 * Real dashboard statistics, computed from the database on every request.
 * Every count is 0 on an empty database — nothing here is hardcoded.
 */
export async function GET(): Promise<NextResponse> {
  return handleRoute(async () => {
    const user = await getSessionUser();
    if (!user) return unauthorized();

    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date(now);
    endOfToday.setHours(23, 59, 59, 999);

    const [
      totalCompanies,
      companiesByStatus,
      emailsSent,
      emailsByStatus,
      responses,
      positiveResponses,
      negativeResponses,
      followUpsDueToday,
      followUpsOverdue,
      upcomingMeetingsCount,
      upcomingMeetings,
      dealsByStage,
      activeProjects,
      projectsByStatus,
      recentActivity,
    ] = await Promise.all([
      prisma.company.count(),
      prisma.company.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.emailActivity.count({
        where: { status: { in: [...SENT_STATUSES] } },
      }),
      prisma.emailActivity.groupBy({
        by: ["status"],
        _count: { _all: true },
      }),
      prisma.emailActivity.count({
        where: { status: { in: [...RESPONSE_STATUSES] } },
      }),
      prisma.emailActivity.count({ where: { status: "POSITIVE" } }),
      prisma.emailActivity.count({ where: { status: "NEGATIVE" } }),
      prisma.followUp.count({
        where: {
          status: "PENDING",
          dueDate: { gte: startOfToday, lte: endOfToday },
        },
      }),
      // Overdue is computed from dueDate, not only the stored OVERDUE
      // status, so a PENDING item past its due date is never hidden.
      prisma.followUp.count({
        where: {
          status: { in: ["PENDING", "OVERDUE"] },
          dueDate: { lt: startOfToday },
        },
      }),
      prisma.meeting.count({
        where: { status: "SCHEDULED", dateTime: { gte: now } },
      }),
      prisma.meeting.findMany({
        where: { status: "SCHEDULED", dateTime: { gte: now } },
        orderBy: { dateTime: "asc" },
        take: 5,
        include: {
          company: { select: { id: true, name: true } },
          contact: { select: { id: true, fullName: true } },
        },
      }),
      prisma.deal.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.project.count({
        where: { status: { in: [...ACTIVE_PROJECT_STATUSES] } },
      }),
      prisma.project.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.activityLog.findMany({
        orderBy: { createdAt: "desc" },
        take: 10,
        include: {
          actor: { select: { id: true, name: true, email: true } },
        },
      }),
    ]);

    return jsonOk({
      totalCompanies,
      companiesByStatus: companiesByStatus.map((row) => ({
        status: row.status,
        count: row._count._all,
      })),
      emailsSent,
      emailsByStatus: emailsByStatus.map((row) => ({
        status: row.status,
        count: row._count._all,
      })),
      responses,
      positiveResponses,
      negativeResponses,
      followUpsDueToday,
      followUpsOverdue,
      upcomingMeetingsCount,
      upcomingMeetings: upcomingMeetings.map((m) => ({
        id: m.id,
        title: m.title,
        dateTime: m.dateTime.toISOString(),
        platform: m.platform,
        company: m.company,
        contact: m.contact,
      })),
      dealsByStage: dealsByStage.map((row) => ({
        status: row.status,
        count: row._count._all,
      })),
      activeProjects,
      projectsByStatus: projectsByStatus.map((row) => ({
        status: row.status,
        count: row._count._all,
      })),
      recentActivity: recentActivity.map((a) => ({
        id: a.id,
        action: a.action,
        entityType: a.entityType,
        entityId: a.entityId,
        createdAt: a.createdAt.toISOString(),
        actor: a.actor,
      })),
    });
  });
}
