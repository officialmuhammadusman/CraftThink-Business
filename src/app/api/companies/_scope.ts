import type { Prisma } from "@prisma/client";
import type { SessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  assignedActivityWhere,
  assignedCompanyWhere,
  assignedDealWhere,
  assignedFollowUpWhere,
  assignedMeetingWhere,
  assignedProjectWhere,
  assignedTaskWhere,
  isSuperAdmin,
  type PermLevel,
} from "@/lib/rbac";

/**
 * Shared scoping + duplicate helpers for the CRM module.
 * Lives under api/companies only because module files may not touch
 * src/lib/*; other CRM routes import it from here. Not a route file
 * (underscore prefix), so Next.js never serves it as an endpoint.
 *
 * NEW PERMISSION MODEL: "privileged" now means SUPER_ADMIN only. A
 * legacy ADMIN role grants nothing by itself. The plain scope helpers
 * below (companyScope, linkedScope, ...) return the ASSIGNED scope for
 * every non-Super-Admin caller, regardless of job title. Routes must
 * first gate with moduleAccess() from @/lib/rbac (NONE -> 403) and then
 * pass the grant level to the *ForLevel variants, which return {} for
 * ALL and the assigned scope for ASSIGNED. A level of NONE returns a
 * scope matching nothing (fail-closed net; the route should already
 * have returned 403).
 */

export function isPrivileged(user: SessionUser): boolean {
  return isSuperAdmin(user);
}

/** @deprecated Role-based create gate. Routes now gate on the grant level. */
export function canCreateLead(user: SessionUser): boolean {
  return isPrivileged(user);
}

export function canEditLead(
  user: SessionUser,
  company: { assignedToId: string | null },
): boolean {
  if (isPrivileged(user)) return true;
  return company.assignedToId === user.id;
}

/** Prisma where clause scoping companies to ASSIGNED records (non-SA). */
export function companyScope(user: SessionUser): Prisma.CompanyWhereInput {
  if (isPrivileged(user)) return {};
  return assignedCompanyWhere(user.id);
}

export function companyScopeForLevel(
  user: SessionUser,
  level: PermLevel,
): Prisma.CompanyWhereInput {
  if (level === "ALL" || isPrivileged(user)) return {};
  if (level === "ASSIGNED") return assignedCompanyWhere(user.id);
  return { id: "__no_access__" };
}

/** Scoping for records linked to a company (follow-ups, meetings, deals). */
export function linkedScope(user: SessionUser): Prisma.FollowUpWhereInput {
  if (isPrivileged(user)) return {};
  return assignedFollowUpWhere(user.id);
}

export function linkedScopeForLevel(
  user: SessionUser,
  level: PermLevel,
): Prisma.FollowUpWhereInput {
  if (level === "ALL" || isPrivileged(user)) return {};
  if (level === "ASSIGNED") return assignedFollowUpWhere(user.id);
  return { id: "__no_access__" };
}

export function meetingScope(user: SessionUser): Prisma.MeetingWhereInput {
  if (isPrivileged(user)) return {};
  return assignedMeetingWhere(user.id);
}

export function meetingScopeForLevel(
  user: SessionUser,
  level: PermLevel,
): Prisma.MeetingWhereInput {
  if (level === "ALL" || isPrivileged(user)) return {};
  if (level === "ASSIGNED") return assignedMeetingWhere(user.id);
  return { id: "__no_access__" };
}

export function dealScope(user: SessionUser): Prisma.DealWhereInput {
  if (isPrivileged(user)) return {};
  return assignedDealWhere(user.id);
}

export function dealScopeForLevel(
  user: SessionUser,
  level: PermLevel,
): Prisma.DealWhereInput {
  if (level === "ALL" || isPrivileged(user)) return {};
  if (level === "ASSIGNED") return assignedDealWhere(user.id);
  return { id: "__no_access__" };
}

/** Scoping for projects: manager, developer, or task assignee. */
export function projectScope(user: SessionUser): Prisma.ProjectWhereInput {
  if (isPrivileged(user)) return {};
  return assignedProjectWhere(user.id);
}

export function projectScopeForLevel(
  user: SessionUser,
  level: PermLevel,
): Prisma.ProjectWhereInput {
  if (level === "ALL" || isPrivileged(user)) return {};
  if (level === "ASSIGNED") return assignedProjectWhere(user.id);
  return { id: "__no_access__" };
}

/** Scoping for tasks (through their project, or direct assignment). */
export function taskScope(user: SessionUser): Prisma.TaskWhereInput {
  if (isPrivileged(user)) return {};
  return assignedTaskWhere(user.id);
}

export function taskScopeForLevel(
  user: SessionUser,
  level: PermLevel,
): Prisma.TaskWhereInput {
  if (level === "ALL" || isPrivileged(user)) return {};
  if (level === "ASSIGNED") return assignedTaskWhere(user.id);
  return { id: "__no_access__" };
}

/**
 * Who may fully edit a project: Super Admin, or a member in the
 * project's ASSIGNED scope (manager / developer / task assignee).
 * Routes additionally require PROJECTS != NONE and, for ASSIGNED
 * callers, forbid changing manager/developer assignment to others.
 */
export function canManageProject(
  user: SessionUser,
  project: {
    managerId: string | null;
    developers?: { id: string }[];
    tasks?: { assignedToId: string | null }[];
  },
): boolean {
  if (isPrivileged(user)) return true;
  if (project.managerId === user.id) return true;
  if (project.developers?.some((d) => d.id === user.id)) return true;
  if (project.tasks?.some((t) => t.assignedToId === user.id)) return true;
  return false;
}

/** Who may fully edit a task: Super Admin, its project manager/developer, or its assignee. */
export function canManageTask(
  user: SessionUser,
  task: {
    assignedToId: string | null;
    project: { managerId: string | null; developers: { id: string }[] };
  },
): boolean {
  if (isPrivileged(user)) return true;
  if (task.assignedToId === user.id) return true;
  if (task.project.managerId === user.id) return true;
  if (task.project.developers.some((d) => d.id === user.id)) return true;
  return false;
}

/** Activity log: Super Admin sees all; ASSIGNED sees only own actions. */
export function activityScope(user: SessionUser): Prisma.ActivityLogWhereInput {
  if (isPrivileged(user)) return {};
  return assignedActivityWhere(user.id);
}

export function activityScopeForLevel(
  user: SessionUser,
  level: PermLevel,
): Prisma.ActivityLogWhereInput {
  if (level === "ALL" || isPrivileged(user)) return {};
  if (level === "ASSIGNED") return assignedActivityWhere(user.id);
  return { id: "__no_access__" };
}

/** A non-Super-Admin may edit a linked record only if assigned to them (or its company). */
export function canEditLinked(
  user: SessionUser,
  record: { assignedToId: string | null; companyAssignedToId?: string | null },
): boolean {
  if (isPrivileged(user)) return true;
  if (record.assignedToId === user.id) return true;
  if (record.companyAssignedToId !== undefined)
    return record.companyAssignedToId === user.id;
  return false;
}

export function parsePagination(request: Request): {
  page: number;
  limit: number;
  skip: number;
} {
  const params = new URL(request.url).searchParams;
  const page = Math.max(1, Number.parseInt(params.get("page") ?? "1", 10) || 1);
  const limit = Math.min(
    100,
    Math.max(1, Number.parseInt(params.get("limit") ?? "20", 10) || 20),
  );
  return { page, limit, skip: (page - 1) * limit };
}

export function paginationMeta(total: number, page: number, limit: number) {
  return { total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) };
}

export function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

export function normalizeWebsite(website: string | null | undefined): string {
  if (!website) return "";
  return website.trim().toLowerCase().replace(/\/+$/, "");
}

/**
 * Case-insensitive duplicate check for companies: same name + same website,
 * or same name with no website on either side. PostgreSQL treats NULL as
 * distinct, so the no-website case must be checked in code (see schema note).
 */
export async function findDuplicateCompany(
  name: string,
  website: string | null | undefined,
) {
  const targetName = normalizeName(name);
  const targetSite = normalizeWebsite(website);
  const candidates = await prisma.company.findMany({
    where: { name: { equals: name.trim(), mode: "insensitive" } },
    select: {
      id: true,
      name: true,
      website: true,
      industry: true,
      country: true,
      city: true,
      status: true,
      priority: true,
      assignedToId: true,
      createdAt: true,
    },
  });
  return (
    candidates.find((c) => {
      if (normalizeName(c.name) !== targetName) return false;
      return normalizeWebsite(c.website) === targetSite;
    }) ?? null
  );
}

/** Case-insensitive email duplicate within one company. */
export async function findDuplicateContact(companyId: string, email: string) {
  const candidates = await prisma.contact.findMany({
    where: {
      companyId,
      email: { equals: email.trim(), mode: "insensitive" },
    },
    select: { id: true, fullName: true, email: true, jobTitle: true },
  });
  return candidates[0] ?? null;
}

/** Keep only keys the client actually sent (so PATCH never overwrites). */
export function pickPresent<T extends Record<string, unknown>>(
  body: Record<string, unknown>,
  data: T,
): Partial<T> {
  const out: Partial<T> = {};
  for (const key of Object.keys(data) as (keyof T)[]) {
    if (key in body) out[key] = data[key];
  }
  return out;
}
