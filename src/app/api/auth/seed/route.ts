import { NextResponse } from "next/server";
import { hashPassword } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { handleRoute, jsonError, jsonOk } from "@/lib/api";
import { prisma } from "@/lib/prisma";

/**
 * First-run admin seeding ONLY.
 * Succeeds only when (a) no users exist yet AND (b) ADMIN_EMAIL and
 * ADMIN_PASSWORD are set in the environment. Otherwise 403.
 * The seeded password must be changed after first login — see README.
 */
export async function POST(): Promise<NextResponse> {
  return handleRoute(async () => {
    const existing = await prisma.user.count();
    if (existing > 0) {
      return jsonError("Admin already exists", 403);
    }
    const email = process.env.ADMIN_EMAIL;
    const password = process.env.ADMIN_PASSWORD;
    if (!email || !password) {
      return jsonError(
        "ADMIN_EMAIL and ADMIN_PASSWORD must be set to seed the admin",
        403,
      );
    }
    const user = await prisma.user.create({
      data: {
        name: "Super Admin",
        email,
        passwordHash: await hashPassword(password),
        role: "SUPER_ADMIN",
        active: true,
      },
      select: { id: true, name: true, email: true, role: true },
    });
    await writeAudit(user.id, "SEED_ADMIN", "User", user.id);
    return jsonOk({ user }, 201);
  });
}
