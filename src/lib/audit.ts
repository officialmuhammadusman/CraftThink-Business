import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

// Prisma Json input type (plain JSON values only), not a loose Record.
type AuditDetails = Prisma.InputJsonValue;

/**
 * Write an ActivityLog row. Never throws: audit must never break the
 * operation it records. Failures are logged to the server console.
 */
export async function writeAudit(
  actorId: string | null,
  action: string,
  entityType: string,
  entityId?: string | null,
  details?: AuditDetails,
): Promise<void> {
  try {
    await prisma.activityLog.create({
      data: {
        actorId: actorId ?? undefined,
        action,
        entityType,
        entityId: entityId ?? undefined,
        details: details ?? undefined,
      },
    });
  } catch (error) {
    console.error("Failed to write ActivityLog:", error);
  }
}
