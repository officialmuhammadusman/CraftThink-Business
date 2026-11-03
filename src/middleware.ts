import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

/**
 * Page guard: dashboard pages redirect to /login without a valid session.
 * API routes are NOT guarded here — each API route checks the session
 * itself and returns 401, so API clients get JSON instead of a redirect.
 */
export async function middleware(request: NextRequest) {
  const token = request.cookies.get("ct_session")?.value;
  if (!token) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  try {
    await jwtVerify(token, new TextEncoder().encode(secret));
    return NextResponse.next();
  } catch {
    const response = NextResponse.redirect(new URL("/login", request.url));
    response.cookies.set("ct_session", "", { path: "/", maxAge: 0 });
    return response;
  }
}

export const config = {
  matcher: [
    "/",
    "/companies/:path*",
    "/campaigns/:path*",
    "/emails/:path*",
    "/follow-ups/:path*",
    "/meetings/:path*",
    "/deals/:path*",
    "/projects/:path*",
    "/team/:path*",
    "/settings/:path*",
  ],
};
