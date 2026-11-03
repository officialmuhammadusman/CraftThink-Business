import { NextResponse } from "next/server";
import { z } from "zod";

export function jsonOk<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ ok: true, data }, { status });
}

export function jsonError(message: string, status = 400): NextResponse {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export function unauthorized(message = "Unauthenticated"): NextResponse {
  return jsonError(message, 401);
}

export function forbidden(message = "Forbidden"): NextResponse {
  return jsonError(message, 403);
}

export function notFound(message = "Not found"): NextResponse {
  return jsonError(message, 404);
}

/** Parse a request body with a Zod schema; returns data or an error response. */
export async function parseBody<T>(
  request: Request,
  schema: z.ZodType<T>,
): Promise<{ data: T } | { error: NextResponse }> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { error: jsonError("Request body must be valid JSON", 400) };
  }
  const result = schema.safeParse(body);
  if (!result.success) {
    const first = result.error.issues[0];
    const message = first
      ? `${first.path.join(".") || "body"}: ${first.message}`
      : "Invalid request body";
    return { error: jsonError(message, 422) };
  }
  return { data: result.data };
}

/** Standard handler wrapper: unexpected errors become a 500, never a leak. */
export async function handleRoute(
  handler: () => Promise<NextResponse>,
): Promise<NextResponse> {
  try {
    return await handler();
  } catch (error) {
    console.error("API route error:", error);
    return jsonError("Internal server error", 500);
  }
}
