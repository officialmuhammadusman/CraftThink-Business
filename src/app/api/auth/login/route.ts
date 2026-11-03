import { NextResponse } from "next/server";
import {
  sessionCookieOptions,
  signSession,
  verifyPassword,
} from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { handleRoute, jsonError, jsonOk, parseBody } from "@/lib/api";
import { loginSchema } from "@/lib/validation";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request): Promise<NextResponse> {
  return handleRoute(async () => {
    const parsed = await parseBody(request, loginSchema);
    if ("error" in parsed) return parsed.error;
    const { email, password } = parsed.data;

    const user = await prisma.user.findUnique({ where: { email } });
    // Same message for unknown email, wrong password, and inactive account:
    // do not reveal which one failed.
    if (!user || !user.active) {
      return jsonError("Invalid email or password", 401);
    }
    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      return jsonError("Invalid email or password", 401);
    }

    let token: string;
    try {
      token = await signSession({
        sub: user.id,
        email: user.email,
        role: user.role,
      });
    } catch {
      return jsonError(
        "Server is not configured for sign-in (AUTH_SECRET missing)",
        500,
      );
    }

    await writeAudit(user.id, "LOGIN", "User", user.id);
    const response = jsonOk({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
    response.cookies.set({ ...sessionCookieOptions(), value: token });
    return response;
  });
}
