import type { Prisma } from "@prisma/client";
import type { SessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Shared scoping + duplicate helpers for the CRM module (Builder B).
 * Lives under api/companies only because module files may not touch
 * src/lib/*; other CRM routes import it from here. Not a route file
 * (underscore prefix), so Next.js never serves it as an endpoint.
 */

export function isPrivileged(user: SessionUser): boolean {
  return user.role === "SUPER_ADMIN" || user.role === "ADMIN";
}

export function canCreateLead(user: SessionUser): boolean {
  return (
    user.role === "SUPER_ADMIN" ||
    user.role === "ADMIN" ||
    user.role === "SALES_EXECUTIVE"
  );
}

export function canEditLead(
  user: SessionUser,
  company: { assignedToId: string | null },
): boolean {
  if (isPrivileged(user)) return true;
  if (user.role === "SALES_EXECUTIVE" && company.assignedToId === user.id)
    return true;
  return false;
}

/** Prisma where clause scoping companies to what `user` may see. */
export function companyScope(user: SessionUser): Prisma.CompanyWhereInput {
  if (isPrivileged(user)) return {};
  if (user.role === "SALES_EXECUTIVE") {
    return { assignedToId: user.id };
  }
  if (user.role === "PROJECT_MANAGER") {
    return {
      OR: [
        { assignedToId: user.id },
        { projects: { some: { managerId: user.id } } },
        { projects: { some: { developers: { some: { id: user.id } } } } },
        { meetings: { some: { assignedToId: user.id } } },
      ],
    };
  }
  // DEVELOPER / DESIGNER: only companies of projects they work on
  // (as an assigned developer, or through an assigned task).
  return {
    projects: {
      some: {
        OR: [
          { developers: { some: { id: user.id } } },
          { tasks: { some: { assignedToId: user.id } } },
        ],
      },
    },
  };
}

/** Scoping for records linked to a company (follow-ups, meetings, deals). */
export function linkedScope(user: SessionUser): Prisma.FollowUpWhereInput {
  if (isPrivileged(user)) return {};
  return {
    OR: [{ assignedToId: user.id }, { company: { assignedToId: user.id } }],
  };
}

export function meetingScope(user: SessionUser): Prisma.MeetingWhereInput {
  if (isPrivileged(user)) return {};
  return {
    OR: [{ assignedToId: user.id }, { company: { assignedToId: user.id } }],
  };
}

export function dealScope(user: SessionUser): Prisma.DealWhereInput {
  if (isPrivileged(user)) return {};
  return {
    OR: [{ assignedToId: user.id }, { company: { assignedToId: user.id } }],
  };
}

/** Scoping for projects. Sales sees projects of companies assigned to them. */
export function projectScope(user: SessionUser): Prisma.ProjectWhereInput {
  if (isPrivileged(user)) return {};
  if (user.role === "PROJECT_MANAGER") {
    return {
      OR: [
        { managerId: user.id },
        { developers: { some: { id: user.id } } },
        { tasks: { some: { assignedToId: user.id } } },
      ],
    };
  }
  if (user.role === "SALES_EXECUTIVE") {
    return { company: { assignedToId: user.id } };
  }
  // DEVELOPER / DESIGNER: assigned developer, or holds a task on the project.
  return {
    OR: [
      { developers: { some: { id: user.id } } },
      { tasks: { some: { assignedToId: user.id } } },
    ],
  };
}

/** Scoping for tasks (through their project, or direct assignment). */
export function taskScope(user: SessionUser): Prisma.TaskWhereInput {
  if (isPrivileged(user)) return {};
  if (user.role === "PROJECT_MANAGER") {
    return {
      OR: [
        { assignedToId: user.id },
        { project: { managerId: user.id } },
        { project: { developers: { some: { id: user.id } } } },
      ],
    };
  }
  if (user.role === "SALES_EXECUTIVE") {
    return { project: { company: { assignedToId: user.id } } };
  }
  return {
    OR: [
      { assignedToId: user.id },
      { project: { developers: { some: { id: user.id } } } },
    ],
  };
}

/** Who may edit/delete a project: admins, or its project manager. */
export function canManageProject(
  user: SessionUser,
  project: { managerId: string | null },
): boolean {
  if (isPrivileged(user)) return true;
  return user.role === "PROJECT_MANAGER" && project.managerId === user.id;
}

/** Who may fully edit a task: admins, its project manager, or a developer on the project. */
export function canManageTask(
  user: SessionUser,
  task: {
    assignedToId: string | null;
    project: { managerId: string | null; developers: { id: string }[] };
  },
): boolean {
  if (isPrivileged(user)) return true;
  if (user.role === "PROJECT_MANAGER" && task.project.managerId === user.id)
    return true;
  if (
    (user.role === "DEVELOPER" || user.role === "DESIGNER") &&
    task.project.developers.some((d) => d.id === user.id)
  )
    return true;
  return false;
}

/** Activity log: admins see all; everyone else sees only their own actions. */
export function activityScope(user: SessionUser): Prisma.ActivityLogWhereInput {
  if (isPrivileged(user)) return {};
  return { actorId: user.id };
}

/** A non-admin may see a linked record only if it is assigned to them. */
export function canEditLinked(
  user: SessionUser,
  record: { assignedToId: string | null },
): boolean {
  if (isPrivileged(user)) return true;
  return record.assignedToId === user.id;
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
