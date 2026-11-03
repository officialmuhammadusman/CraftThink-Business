import { NextResponse } from "next/server";
import { clearedSessionCookieOptions } from "@/lib/auth";
import { handleRoute, jsonOk } from "@/lib/api";

export async function POST(): Promise<NextResponse> {
  return handleRoute(async () => {
    const response = jsonOk({ loggedOut: true });
    response.cookies.set({ ...clearedSessionCookieOptions(), value: "" });
    return response;
  });
}
