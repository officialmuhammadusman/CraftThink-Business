import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { handleRoute, jsonOk, unauthorized } from "@/lib/api";

export async function GET(): Promise<NextResponse> {
  return handleRoute(async () => {
    const user = await getSessionUser();
    if (!user) return unauthorized();
    return jsonOk({ user });
  });
}
