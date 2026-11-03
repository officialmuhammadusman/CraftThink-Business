import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getPermissionMap, assignedCompanyWhere, assignedEmailWhere, assignedFollowUpWhere, assignedMeetingWhere, assignedDealWhere, assignedProjectWhere, assignedActivityWhere } from "@/lib/rbac";
import { handleRoute, jsonOk, unauthorized, forbidden } from "@/lib/api";
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
    // Dashboard numbers are scoped per module: a module with NONE
    // contributes 0 / empty, ASSIGNED contributes only assigned rows,
    // ALL contributes everything. A user with no grant at all gets 403.
    const perms = await getPermissionMap(user.id);
    const anyAccess = Object.values(perms).some((l) => l !== "NONE");
    if (!anyAccess) return forbidden();
    const companyWhere = perms.COMPANIES === "NONE" ? { id: "__no_access__" } : perms.COMPANIES === "ALL" ? {} : assignedCompanyWhere(user.id);
    const emailWhere = perms.EMAILS === "NONE" ? { id: "__no_access__" } : perms.EMAILS === "ALL" ? {} : assignedEmailWhere(user.id);
    const followUpWhere = perms.FOLLOW_UPS === "NONE" ? { id: "__no_access__" } : perms.FOLLOW_UPS === "ALL" ? {} : assignedFollowUpWhere(user.id);
    const meetingWhere = perms.MEETINGS === "NONE" ? { id: "__no_access__" } : perms.MEETINGS === "ALL" ? {} : assignedMeetingWhere(user.id);
    const dealWhere = perms.DEALS === "NONE" ? { id: "__no_access__" } : perms.DEALS === "ALL" ? {} : assignedDealWhere(user.id);
    const projectWhere = perms.PROJECTS === "NONE" ? { id: "__no_access__" } : perms.PROJECTS === "ALL" ? {} : assignedProjectWhere(user.id);
    const activityWhere = perms.ACTIVITY_LOG === "NONE" ? { id: "__no_access__" } : perms.ACTIVITY_LOG === "ALL" ? {} : assignedActivityWhere(user.id);

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
      prisma.company.count({ where: companyWhere as never }),
      prisma.company.groupBy({ by: ["status"], where: companyWhere as never, _count: { _all: true } }),
      prisma.emailActivity.count({
        where: { AND: [emailWhere, { status: { in: [...SENT_STATUSES] } }] } as never,
      }),
      prisma.emailActivity.groupBy({
        by: ["status"],
        where: emailWhere as never,
        _count: { _all: true },
      }),
      prisma.emailActivity.count({
        where: { AND: [emailWhere, { status: { in: [...RESPONSE_STATUSES] } }] } as never,
      }),
      prisma.emailActivity.count({ where: { AND: [emailWhere, { status: "POSITIVE" }] } as never }),
      prisma.emailActivity.count({ where: { AND: [emailWhere, { status: "NEGATIVE" }] } as never }),
      prisma.followUp.count({
        where: {
          AND: [
            followUpWhere,
            { status: "PENDING", dueDate: { gte: startOfToday, lte: endOfToday } },
          ],
        } as never,
      }),
      // Overdue is computed from dueDate, not only the stored OVERDUE
      // status, so a PENDING item past its due date is never hidden.
      prisma.followUp.count({
        where: {
          AND: [
            followUpWhere,
            { status: { in: ["PENDING", "OVERDUE"] }, dueDate: { lt: startOfToday } },
          ],
        } as never,
      }),
      prisma.meeting.count({
        where: { AND: [meetingWhere, { status: "SCHEDULED", dateTime: { gte: now } }] } as never,
      }),
      prisma.meeting.findMany({
        where: { AND: [meetingWhere, { status: "SCHEDULED", dateTime: { gte: now } }] } as never,
        orderBy: { dateTime: "asc" },
        take: 5,
        include: {
          company: { select: { id: true, name: true } },
          contact: { select: { id: true, fullName: true } },
        },
      }),
      prisma.deal.groupBy({ by: ["status"], where: dealWhere as never, _count: { _all: true } }),
      prisma.project.count({
        where: { AND: [projectWhere, { status: { in: [...ACTIVE_PROJECT_STATUSES] } }] } as never,
      }),
      prisma.project.groupBy({ by: ["status"], where: projectWhere as never, _count: { _all: true } }),
      prisma.activityLog.findMany({
        where: activityWhere as never,
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
