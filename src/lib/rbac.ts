import type { Role } from "@prisma/client";
import { getSessionUser, type SessionUser } from "./auth";

// Higher number = more privilege. SUPER_ADMIN can do everything;
// DESIGNER/DEVELOPER are the most restricted roles.
export const ROLE_RANK: Record<Role, number> = {
  SUPER_ADMIN: 6,
  ADMIN: 5,
  PROJECT_MANAGER: 4,
  SALES_EXECUTIVE: 3,
  DEVELOPER: 2,
  DESIGNER: 1,
};

/** True when `role` is at least as privileged as `minimumRole`. */
export function can(role: Role | string, minimumRole: Role): boolean {
  const rank = ROLE_RANK[role as Role];
  if (rank === undefined) return false;
  return rank >= ROLE_RANK[minimumRole];
}

/**
 * Authenticated, active current user, or null.
 * Route handlers: `if (!user) return unauthorized();`
 */
export async function requireAuth(): Promise<SessionUser | null> {
  return getSessionUser();
}

/**
 * Authenticated, active current user whose role is in `roles`, or null.
 * Use for role-restricted routes, e.g.
 * `const user = await requireRole(["SUPER_ADMIN", "ADMIN"]);`
 * Returns null for both unauthenticated and insufficient-role callers so
 * handlers can answer 401/403 uniformly; check requireAuth() first when
 * the distinction matters.
 */
export async function requireRole(
  roles: Role[],
): Promise<SessionUser | null> {
  const user = await getSessionUser();
  if (!user) return null;
  if (!roles.includes(user.role as Role)) return null;
  return user;
}
