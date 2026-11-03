import type { EmailActivity } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { SessionUser } from "@/lib/auth";

/**
 * Shared helpers for the cold-email TRACKING module (Module C).
 * Tracking only: this app records emails that were sent separately
 * elsewhere. There is no sending code anywhere in this module.
 */

export const EMAIL_STATUSES = [
  "DRAFT",
  "SCHEDULED",
  "SENT",
  "DELIVERED",
  "BOUNCED",
  "REPLIED",
  "POSITIVE",
  "NEGATIVE",
  "FOLLOW_UP_REQUIRED",
  "UNSUBSCRIBED",
] as const;

// Statuses after which no follow-up is due (task rule 6).
export const FOLLOW_UP_DUE_EXCLUDED = [
  "REPLIED",
  "POSITIVE",
  "NEGATIVE",
  "UNSUBSCRIBED",
  "BOUNCED",
] as const;

// NEW MODEL: "admin" now means Super Admin only. A legacy ADMIN role
// grants nothing by itself; module access comes from PermissionGrant
// rows (see @/lib/rbac). Routes gate on moduleAccess(), not this.
export function isAdmin(user: SessionUser): boolean {
  return user.role === "SUPER_ADMIN";
}

export function isSuperAdmin(user: SessionUser): boolean {
  return user.role === "SUPER_ADMIN";
}

/**
 * @deprecated Role-based outreach gate. Routes now gate on the grant
 * level for the route's module (ASSIGNED = own records, ALL = any).
 */
export function canManageOutreach(user: SessionUser): boolean {
  return user.role === "SUPER_ADMIN";
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function endOfToday(): Date {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}

export function parsePagination(searchParams: URLSearchParams): {
  page: number;
  limit: number;
} {
  const rawPage = Number(searchParams.get("page") ?? "1");
  const rawLimit = Number(searchParams.get("limit") ?? "20");
  const page = Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1;
  const limit =
    Number.isFinite(rawLimit) && rawLimit >= 1
      ? Math.min(Math.floor(rawLimit), 100)
      : 20;
  return { page, limit };
}

export function paginationMeta(total: number, page: number, limit: number) {
  return { total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) };
}

export const activityInclude = {
  company: { select: { id: true, name: true, website: true } },
  contact: { select: { id: true, fullName: true, email: true } },
  campaign: { select: { id: true, name: true } },
  template: { select: { id: true, name: true } },
  assignedTo: { select: { id: true, name: true, email: true } },
} as const;

/**
 * Add an address to the Suppression list (idempotent). Used when an
 * activity is marked UNSUBSCRIBED. Removal is Super-Admin-only and
 * lives in the suppression DELETE route.
 */
export async function ensureSuppressed(
  email: string,
  reason: string | null,
): Promise<void> {
  const normalized = normalizeEmail(email);
  await prisma.suppression.upsert({
    where: { email: normalized },
    update: {},
    create: {
      email: normalized,
      reason: reason ?? "Unsubscribed via email status update",
      scope: "GLOBAL",
    },
  });
}

type SyncableActivity = Pick<
  EmailActivity,
  "id" | "companyId" | "contactId" | "subject" | "followUpDate" | "assignedToId" | "status"
>;

/**
 * Keep the FollowUp row for a tracked email in sync with the activity.
 * FollowUp has no FK to EmailActivity, so the link is the reason prefix
 * `Follow-up for tracked email <activityId>`. Rules:
 * - followUpDate set + non-terminal status -> create or update the row.
 * - followUpDate set + terminal status -> mark existing row DONE, create none.
 * - followUpDate cleared -> delete pending/overdue rows (DONE rows kept).
 * - terminal status on an existing row -> DONE.
 */
export async function syncFollowUpForActivity(
  activity: SyncableActivity,
): Promise<void> {
  const prefix = `Follow-up for tracked email ${activity.id}`;
  const existing = await prisma.followUp.findMany({
    where: { reason: { startsWith: prefix } },
  });

  if (!activity.followUpDate) {
    const pendingIds = existing
      .filter((f) => f.status !== "DONE")
      .map((f) => f.id);
    if (pendingIds.length > 0) {
      await prisma.followUp.deleteMany({ where: { id: { in: pendingIds } } });
    }
    return;
  }

  const terminal = (FOLLOW_UP_DUE_EXCLUDED as readonly string[]).includes(
    activity.status,
  );
  if (terminal) {
    if (existing.length > 0) {
      await prisma.followUp.updateMany({
        where: { id: { in: existing.map((f) => f.id) } },
        data: {
          dueDate: activity.followUpDate,
          assignedToId: activity.assignedToId ?? undefined,
          status: "DONE",
        },
      });
    }
    return;
  }

  const computed =
    activity.followUpDate < startOfToday() ? "OVERDUE" : "PENDING";
  if (existing.length > 0) {
    for (const row of existing) {
      await prisma.followUp.update({
        where: { id: row.id },
        data: {
          dueDate: activity.followUpDate,
          companyId: activity.companyId,
          contactId: activity.contactId ?? undefined,
          assignedToId: activity.assignedToId ?? undefined,
          status: row.status === "DONE" ? "DONE" : computed,
        },
      });
    }
    return;
  }

  await prisma.followUp.create({
    data: {
      companyId: activity.companyId,
      contactId: activity.contactId ?? undefined,
      dueDate: activity.followUpDate,
      reason: `${prefix}: ${activity.subject}`.slice(0, 500),
      status: computed,
      assignedToId: activity.assignedToId ?? undefined,
    },
  });
}

/** Suppression validation (kept here so both suppression routes share it). */
export const suppressionSchema = z.object({
  email: z.string().trim().email("Enter a valid email address"),
  reason: z.string().trim().max(2000).optional().nullable(),
  scope: z.string().trim().min(1).max(255).default("GLOBAL"),
});

/** Minimal CSV parser: quoted fields, embedded commas, "" escapes, CRLF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      pushField();
    } else if (ch === "\n") {
      pushRow();
    } else if (ch === "\r") {
      if (text[i + 1] !== "\n") pushRow();
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length > 0) pushRow();
  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ""));
}

/** Delete pending/overdue follow-up rows linked to a deleted activity. */
export async function deleteLinkedFollowUps(activityId: string): Promise<void> {
  const prefix = `Follow-up for tracked email ${activityId}`;
  const rows = await prisma.followUp.findMany({
    where: { reason: { startsWith: prefix }, status: { not: "DONE" } },
  });
  if (rows.length > 0) {
    await prisma.followUp.deleteMany({
      where: { id: { in: rows.map((r) => r.id) } },
    });
  }
}
