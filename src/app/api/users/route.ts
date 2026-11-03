import { NextResponse } from "next/server";
import { requireAuth, moduleAccess, isSuperAdmin } from "@/lib/rbac";
import { hashPassword } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { userCreateSchema } from "@/lib/validation";
import { prisma } from "@/lib/prisma";
import {
  forbidden,
  handleRoute,
  jsonError,
  jsonOk,
  parseBody,
  unauthorized,
} from "@/lib/api";

const PUBLIC_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  active: true,
  createdAt: true,
  updatedAt: true,
  permissionGrants: { select: { module: true, level: true } },
} as const;

// passwordHash is NEVER selected or returned by any user route.

export async function GET(request: Request): Promise<NextResponse> {
  return handleRoute(async () => {
    // Team listing is TEAM-gated: ALL sees everyone, ASSIGNED sees
    // only themselves, NONE is forbidden. The Team page itself is
    // Super-Admin-only; this API rule is what actually protects data.
    const access = await moduleAccess("TEAM");
    if (!access.ok) return access.reason === "unauthenticated" ? unauthorized() : forbidden();
    const user = access.user;
    const level = access.level;
    const role = new URL(request.url).searchParams.get("role") ?? "";
    const items = await prisma.user.findMany({
      where:
        level === "ALL"
          ? role
            ? { role: role as never }
            : {}
          : { id: user.id },
      select: PUBLIC_SELECT,
      orderBy: { createdAt: "desc" },
    });
    return jsonOk({ items });
  });
}

export async function POST(request: Request): Promise<NextResponse> {
  return handleRoute(async () => {
    const user = await requireAuth();
    if (!user) return unauthorized();
    // Only the Super Admin creates users — never by job title.
    if (!isSuperAdmin(user)) return forbidden("Only the Super Admin creates users");
    const parsed = await parseBody(request, userCreateSchema);
    if ("error" in parsed) return parsed.error;
    const data = parsed.data;
    // No new SUPER_ADMIN or ADMIN accounts, ever (enforced here even
    // if a hand-crafted request bypasses the UI's job-title-only form).
    if (data.role === "SUPER_ADMIN" || data.role === "ADMIN") {
      return forbidden("New Super Admin and Admin accounts cannot be created");
    }
    const existing = await prisma.user.findUnique({
      where: { email: data.email.trim().toLowerCase() },
      select: { id: true },
    });
    if (existing) return jsonError("A user with this email already exists", 409);
    const item = await prisma.user.create({
      data: {
        name: data.name.trim(),
        email: data.email.trim().toLowerCase(),
        passwordHash: await hashPassword(data.password),
        role: data.role,
      },
      select: PUBLIC_SELECT,
    });
    await writeAudit(user.id, "USER_CREATED", "User", item.id, {
      email: item.email,
      role: item.role,
    });
    return jsonOk(item, 201);
  });
}
