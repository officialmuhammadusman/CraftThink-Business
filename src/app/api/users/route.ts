import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/rbac";
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
import { isPrivileged } from "../companies/_scope";

const PUBLIC_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  active: true,
  createdAt: true,
  updatedAt: true,
} as const;

// passwordHash is NEVER selected or returned by any user route.

export async function GET(request: Request): Promise<NextResponse> {
  return handleRoute(async () => {
    const user = await requireAuth();
    if (!user) return unauthorized();
    if (!isPrivileged(user)) return forbidden("Only admins manage the team");
    const role = new URL(request.url).searchParams.get("role") ?? "";
    const items = await prisma.user.findMany({
      where: role ? { role: role as never } : {},
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
    if (!isPrivileged(user)) return forbidden("Only admins create users");
    const parsed = await parseBody(request, userCreateSchema);
    if ("error" in parsed) return parsed.error;
    const data = parsed.data;
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
