import type { Prisma, Role } from "@prisma/client";
import { getSessionUser, type SessionUser } from "./auth";
import { prisma } from "./prisma";

/**
 * Permission model (see docs/rbac-matrix.md).
 *
 * - There is ONE Super Admin (the seeded account). SUPER_ADMIN bypasses
 *   every grant check. No new SUPER_ADMIN or ADMIN users may be created;
 *   the Role enum is kept in the schema only so existing rows stay valid.
 * - Every other user has a job title (PROJECT_MANAGER / SALES_EXECUTIVE /
 *   DEVELOPER / DESIGNER) that is DISPLAY / TITLE ONLY. It grants nothing
 *   by itself. Access comes only from PermissionGrant rows, one per
 *   (user, module), with level NONE / ASSIGNED / ALL.
 * - A member with no grant row for a module defaults to NONE.
 * - Every check is server-side, in API routes, before any query or
 *   mutation. Hiding a sidebar link grants nothing and is never a check.
 */

// ---------------------------------------------------------------- modules
export const MODULES = [
  "COMPANIES",
  "CAMPAIGNS",
  "TEMPLATES",
  "EMAILS",
  "FOLLOW_UPS",
  "MEETINGS",
  "DEALS",
  "PROJECTS",
  "TASKS",
  "ACTIVITY_LOG",
  "TEAM",
  "SETTINGS",
] as const;

export type Module = (typeof MODULES)[number];

export function isModule(value: unknown): value is Module {
  return (
    typeof value === "string" &&
    (MODULES as readonly string[]).includes(value)
  );
}

// Job titles that may be offered when creating a member. SUPER_ADMIN and
// ADMIN are deliberately absent: no new account may be created with them.
export const MEMBER_ROLES = [
  "PROJECT_MANAGER",
  "SALES_EXECUTIVE",
  "DEVELOPER",
  "DESIGNER",
] as const;

export type MemberRole = (typeof MEMBER_ROLES)[number];

export function isMemberRole(value: unknown): value is MemberRole {
  return (
    typeof value === "string" &&
    (MEMBER_ROLES as readonly string[]).includes(value)
  );
}

// ------------------------------------------------------------------ levels
export type PermLevel = "NONE" | "ASSIGNED" | "ALL";

export const PERM_LEVELS: readonly PermLevel[] = ["NONE", "ASSIGNED", "ALL"];

export const PERM_RANK: Record<PermLevel, number> = {
  NONE: 0,
  ASSIGNED: 1,
  ALL: 2,
};

export function isPermLevel(value: unknown): value is PermLevel {
  return (
    typeof value === "string" &&
    (PERM_LEVELS as readonly string[]).includes(value)
  );
}

/** True when `level` is at least `minimum` (NONE < ASSIGNED < ALL). */
export function permAtLeast(level: PermLevel, minimum: PermLevel): boolean {
  return PERM_RANK[level] >= PERM_RANK[minimum];
}

export function isSuperAdmin(
  user: Pick<SessionUser, "role"> | null | undefined,
): boolean {
  return user?.role === "SUPER_ADMIN";
}

// ------------------------------------------------------- legacy role ranks
// Kept ONLY so existing callers of `can` / `requireRole` keep compiling
// and behaving as before. Role rank is NOT module access: do not use it
// to gate a module route — use getPermission / moduleAccess instead.
export const ROLE_RANK: Record<Role, number> = {
  SUPER_ADMIN: 6,
  ADMIN: 5,
  PROJECT_MANAGER: 4,
  SALES_EXECUTIVE: 3,
  DEVELOPER: 2,
  DESIGNER: 1,
};

/** True when `role` is at least as privileged as `minimumRole` (legacy). */
export function can(role: Role | string, minimumRole: Role): boolean {
  const rank = ROLE_RANK[role as Role];
  if (rank === undefined) return false;
  return rank >= ROLE_RANK[minimumRole];
}

// ------------------------------------------------------------- session auth
/**
 * Authenticated, active current user, or null.
 * Route handlers: `if (!user) return unauthorized();`
 */
export async function requireAuth(): Promise<SessionUser | null> {
  return getSessionUser();
}

/**
 * Authenticated, active current user whose role is in `roles`, or null.
 * Legacy helper, kept for callers not yet migrated to grant checks.
 * Returns null for both unauthenticated and insufficient-role callers.
 */
export async function requireRole(
  roles: Role[],
): Promise<SessionUser | null> {
  const user = await getSessionUser();
  if (!user) return null;
  if (!roles.includes(user.role as Role)) return null;
  return user;
}

// ------------------------------------------------------------ grant reading
/**
 * The grant level for one user + module. SUPER_ADMIN always ALL.
 * A member with no PermissionGrant row for the module gets NONE.
 * Returns NONE (never throws to an open state) for unknown users.
 */
export async function getPermission(
  userId: string,
  module: Module,
): Promise<PermLevel> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  if (!user) return "NONE";
  if (user.role === "SUPER_ADMIN") return "ALL";
  const grant = await prisma.permissionGrant.findUnique({
    where: { userId_module: { userId, module } },
    select: { level: true },
  });
  if (!grant || !isPermLevel(grant.level)) return "NONE";
  return grant.level;
}

/** All module levels for one user (SUPER_ADMIN: ALL everywhere). */
export async function getPermissionMap(
  userId: string,
): Promise<Record<Module, PermLevel>> {
  const base = Object.fromEntries(
    MODULES.map((m) => [m, "NONE" as PermLevel]),
  ) as Record<Module, PermLevel>;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  if (!user) return base;
  if (user.role === "SUPER_ADMIN") {
    return Object.fromEntries(
      MODULES.map((m) => [m, "ALL" as PermLevel]),
    ) as Record<Module, PermLevel>;
  }
  const grants = await prisma.permissionGrant.findMany({
    where: { userId },
    select: { module: true, level: true },
  });
  for (const grant of grants) {
    if (isModule(grant.module) && isPermLevel(grant.level)) {
      base[grant.module] = grant.level;
    }
  }
  return base;
}

// --------------------------------------------------------- permission gates
/**
 * Session user whose grant for `module` is at least `minimumLevel`,
 * or null (unauthenticated, or grant below the minimum). SUPER_ADMIN
 * always passes. Use when a route only needs a yes/no gate and does
 * not need to scope a query.
 */
export async function requirePermission(
  module: Module,
  minimumLevel: PermLevel,
): Promise<SessionUser | null> {
  const user = await getSessionUser();
  if (!user) return null;
  if (isSuperAdmin(user)) return user;
  const level = await getPermission(user.id, module);
  return permAtLeast(level, minimumLevel) ? user : null;
}

/**
 * Session user + grant level for `module`, or null when unauthenticated
 * or when the grant is NONE. Routes that scope queries use this.
 */
export async function requireModuleAccess(
  module: Module,
): Promise<{ user: SessionUser; level: PermLevel } | null> {
  const user = await getSessionUser();
  if (!user) return null;
  const level = await getPermission(user.id, module);
  if (level === "NONE") return null;
  return { user, level };
}

/**
 * Discriminated version of requireModuleAccess, so routes can answer
 * 401 (unauthenticated) vs 403 (authenticated but no grant) correctly:
 *
 *   const access = await moduleAccess("COMPANIES");
 *   if (!access.ok) return access.reason === "unauthenticated"
 *     ? unauthorized() : forbidden();
 *   const { user, level } = access;
 */
export async function moduleAccess(
  module: Module,
): Promise<
  | { ok: true; user: SessionUser; level: PermLevel }
  | { ok: false; reason: "unauthenticated" | "forbidden" }
> {
  const user = await getSessionUser();
  if (!user) return { ok: false, reason: "unauthenticated" };
  const level = await getPermission(user.id, module);
  if (level === "NONE") return { ok: false, reason: "forbidden" };
  return { ok: true, user, level };
}

// ------------------------------------------------------------ assigned scope
// "Assigned" means: the record names this user, or the record belongs to
// work this user is on. These fragments are the Prisma `where` clauses
// for list queries and scoped detail lookups. They are role-independent:
// a Developer's PROJECTS=ASSIGNED and a Sales Executive's PROJECTS=
// ASSIGNED scope identically; only the grant level differs.
// EMAILS is deliberately strict: only activities assigned to the user
// (the documented example — a Developer with EMAILS=ASSIGNED sees only
// emails assigned to him). Linked records (follow-ups / meetings /
// deals) also include records of a company assigned to the user, which
// is the pre-existing linked-scope behaviour for those modules.

export function assignedCompanyWhere(
  userId: string,
): Prisma.CompanyWhereInput {
  return {
    OR: [
      { assignedToId: userId },
      { projects: { some: { managerId: userId } } },
      { projects: { some: { developers: { some: { id: userId } } } } },
      { projects: { some: { tasks: { some: { assignedToId: userId } } } } },
      { meetings: { some: { assignedToId: userId } } },
    ],
  };
}

export function assignedCampaignWhere(
  userId: string,
): Prisma.CampaignWhereInput {
  return { ownerId: userId };
}

export function assignedEmailWhere(
  userId: string,
): Prisma.EmailActivityWhereInput {
  return { assignedToId: userId };
}

export function assignedFollowUpWhere(
  userId: string,
): Prisma.FollowUpWhereInput {
  return {
    OR: [{ assignedToId: userId }, { company: { assignedToId: userId } }],
  };
}

export function assignedMeetingWhere(
  userId: string,
): Prisma.MeetingWhereInput {
  return {
    OR: [{ assignedToId: userId }, { company: { assignedToId: userId } }],
  };
}

export function assignedDealWhere(userId: string): Prisma.DealWhereInput {
  return {
    OR: [{ assignedToId: userId }, { company: { assignedToId: userId } }],
  };
}

export function assignedProjectWhere(
  userId: string,
): Prisma.ProjectWhereInput {
  return {
    OR: [
      { managerId: userId },
      { developers: { some: { id: userId } } },
      { tasks: { some: { assignedToId: userId } } },
    ],
  };
}

export function assignedTaskWhere(userId: string): Prisma.TaskWhereInput {
  return {
    OR: [
      { assignedToId: userId },
      { project: { managerId: userId } },
      { project: { developers: { some: { id: userId } } } },
    ],
  };
}

export function assignedActivityWhere(
  userId: string,
): Prisma.ActivityLogWhereInput {
  return { actorId: userId };
}

/**
 * Whether a single loaded record is inside an ASSIGNED user's scope.
 * Used for detail/PATCH/DELETE routes, which must answer 403 (not 404)
 * when the record exists but is outside the caller's scope, and 404
 * only when it does not exist at all.
 */
export function isAssignedRecord(
  module: Module,
  userId: string,
  record: {
    assignedToId?: string | null;
    ownerId?: string | null;
    managerId?: string | null;
    actorId?: string | null;
    companyAssignedToId?: string | null;
    developerIds?: string[];
    projectManagerId?: string | null;
    projectDeveloperIds?: string[];
    taskAssigneeIds?: string[];
  },
): boolean {
  switch (module) {
    case "COMPANIES":
      return (
        record.assignedToId === userId ||
        record.managerId === userId ||
        (record.developerIds ?? []).includes(userId) ||
        (record.taskAssigneeIds ?? []).includes(userId)
      );
    case "CAMPAIGNS":
      return record.ownerId === userId;
    case "EMAILS":
      return record.assignedToId === userId;
    case "FOLLOW_UPS":
    case "MEETINGS":
    case "DEALS":
      return (
        record.assignedToId === userId ||
        record.companyAssignedToId === userId
      );
    case "PROJECTS":
      return (
        record.managerId === userId ||
        (record.developerIds ?? []).includes(userId) ||
        (record.taskAssigneeIds ?? []).includes(userId)
      );
    case "TASKS":
      return (
        record.assignedToId === userId ||
        record.projectManagerId === userId ||
        (record.projectDeveloperIds ?? []).includes(userId)
      );
    case "ACTIVITY_LOG":
      return record.actorId === userId;
    case "TEAM":
      return record.assignedToId === userId;
    default:
      // TEMPLATES / SETTINGS have no per-user owner: ASSIGNED never
      // matches a single record for mutation purposes (see routes).
      return false;
  }
}

/**
 * Scope helper: given a module + user, returns whether to filter to
 * assigned-only. ALL (and SUPER_ADMIN) => false (unscoped);
 * ASSIGNED => true. NONE is handled by the route's 403 before querying.
 */
export function isAssignedOnly(level: PermLevel): boolean {
  return level !== "ALL";
}
