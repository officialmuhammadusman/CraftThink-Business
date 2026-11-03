"use client";

import * as React from "react";
import type { z } from "zod";
import { cn } from "@/lib/utils";

/** Inline error text under a field, shadcn Form-style. */
export function FieldError({
  message,
  className,
}: {
  message?: string | null;
  className?: string;
}) {
  if (!message) return null;
  return (
    <p role="alert" className={cn("mt-1 text-sm text-red-600", className)}>
      {message}
    </p>
  );
}

/** Map a Zod safeParse result to { fieldName: message } for inline errors. */
export function zodFieldErrors<T>(
  result: z.SafeParseReturnType<unknown, T>,
): Record<string, string> {
  if (result.success) return {};
  const out: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join(".") || "form";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

/** Read the real error message out of a failed fetch response. */
export async function apiErrorMessage(
  res: Response,
  fallback: string,
): Promise<string> {
  try {
    const data = await res.json();
    if (data && typeof data.error === "string" && data.error.trim()) {
      return data.error;
    }
    if (data && typeof data.message === "string" && data.message.trim()) {
      return data.message;
    }
  } catch {
    // Response had no JSON body — fall through to the fallback.
  }
  return `${fallback} (server responded ${res.status})`;
}

/** Extra logical checks that Zod alone does not express. Returns field errors. */
export function logicalDateErrors(input: {
  startDate?: string;
  deadline?: string;
  followUpDate?: string;
  meetingDate?: string;
  meetingStartTime?: string;
  meetingEndTime?: string;
}): Record<string, string> {
  const errors: Record<string, string> = {};
  if (input.startDate && input.deadline && input.deadline < input.startDate) {
    errors.deadline = "Deadline must not be before the start date.";
  }
  if (input.followUpDate) {
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    if (input.followUpDate < todayStr) {
      errors.followUpDate = "Follow-up date must not be in the past.";
    }
  }
  if (
    input.meetingStartTime &&
    input.meetingEndTime &&
    input.meetingEndTime <= input.meetingStartTime
  ) {
    errors.meetingEndTime = "End time must be after the start time.";
  }
  return errors;
}
