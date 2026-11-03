import { NextResponse } from "next/server";
import type { EmailStatus } from "@prisma/client";
import { moduleAccess } from "@/lib/rbac";
import {
  handleRoute,
  jsonError,
  jsonOk,
  unauthorized,
  forbidden,
} from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import {
  normalizeEmail,
  syncFollowUpForActivity,
  EMAIL_STATUSES,
  parseCsv,
} from "@/app/api/emails/shared";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseDateCell(value: string): Date | null | "invalid" {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const d = new Date(trimmed);
  return Number.isNaN(d.getTime()) ? "invalid" : d;
}

/**
 * POST /api/emails/import — multipart form-data, file field `file`.
 * Columns: companyName, companyWebsite, contactName, contactEmail,
 * recipientEmail, senderEmail, subject, body, sentAt, campaignName,
 * sequenceNumber, status, followUpDate, assignedEmail.
 * Missing companies/contacts are auto-created (company matched by
 * name + website, contact by company + email). Rows are skipped when
 * the recipient is suppressed or is an exact duplicate
 * (recipient + subject + sentAt), and both skip counts are reported.
 * Tracking only: this records emails already sent elsewhere; it
 * sends nothing.
 */
export async function POST(request: Request): Promise<NextResponse> {
  return handleRoute(async () => {
    const access = await moduleAccess("EMAILS");
    if (!access.ok) return access.reason === "unauthenticated" ? unauthorized() : forbidden();
    const user = access.user;
    const level = access.level;
    const admin = level === "ALL";

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return jsonError("Request must be multipart form-data with a CSV file", 400);
    }
    const file = formData.get("file");
    if (!file || typeof file === "string") {
      return jsonError("CSV file is required (form field 'file')", 400);
    }
    const text = await file.text();
    const rows = parseCsv(text);
    if (rows.length < 2) {
      return jsonError("CSV must have a header row and at least one data row", 400);
    }
    const header = rows[0].map((h) => h.trim());
    const indexOf = (name: string) => header.indexOf(name);
    for (const required of ["companyName", "recipientEmail", "subject"]) {
      if (indexOf(required) === -1) {
        return jsonError(`CSV header is missing required column: ${required}`, 400);
      }
    }
    const cell = (row: string[], name: string): string => {
      const idx = indexOf(name);
      return idx === -1 ? "" : (row[idx] ?? "").trim();
    };

    let imported = 0;
    let skippedDuplicates = 0;
    let skippedSuppressed = 0;
    let errors = 0;
    const errorRows: { row: number; message: string }[] = [];
    const seenKeys = new Set<string>();

    for (let r = 1; r < rows.length; r += 1) {
      const row = rows[r];
      const rowNumber = r + 1; // 1-based incl. header
      const fail = (message: string) => {
        errors += 1;
        if (errorRows.length < 50) errorRows.push({ row: rowNumber, message });
      };

      const companyName = cell(row, "companyName");
      const recipientRaw = cell(row, "recipientEmail") || cell(row, "contactEmail");
      const subject = cell(row, "subject");
      if (!companyName) {
        fail("companyName is required");
        continue;
      }
      if (!recipientRaw || !EMAIL_RE.test(recipientRaw)) {
        fail("recipientEmail (or contactEmail) must be a valid email address");
        continue;
      }
      if (!subject) {
        fail("subject is required");
        continue;
      }
      const recipientEmail = normalizeEmail(recipientRaw);

      // Suppression enforcement: never record over a suppressed address
      // via import (the address stays on the list untouched).
      const suppressed = await prisma.suppression.findUnique({
        where: { email: recipientEmail },
      });
      if (suppressed) {
        skippedSuppressed += 1;
        continue;
      }

      const sentAt = parseDateCell(cell(row, "sentAt"));
      if (sentAt === "invalid") {
        fail("sentAt is not a valid date");
        continue;
      }
      const followUpDate = parseDateCell(cell(row, "followUpDate"));
      if (followUpDate === "invalid") {
        fail("followUpDate is not a valid date");
        continue;
      }
      const statusCell = cell(row, "status") || "SENT";
      if (!(EMAIL_STATUSES as readonly string[]).includes(statusCell)) {
        fail(`status '${statusCell}' is not a valid email status`);
        continue;
      }
      const sequenceRaw = cell(row, "sequenceNumber");
      const sequenceNumber = sequenceRaw ? Number(sequenceRaw) : 1;
      if (!Number.isInteger(sequenceNumber) || sequenceNumber < 1) {
        fail("sequenceNumber must be a positive integer");
        continue;
      }

      // Exact-duplicate check: recipient + subject + sentAt.
      const dupKey = `${recipientEmail}|${subject}|${sentAt ? sentAt.toISOString() : ""}`;
      const duplicate = await prisma.emailActivity.findFirst({
        where: {
          recipientEmail: { equals: recipientEmail, mode: "insensitive" },
          subject,
          sentAt: sentAt ?? null,
        },
        select: { id: true },
      });
      if (duplicate || seenKeys.has(dupKey)) {
        skippedDuplicates += 1;
        continue;
      }
      seenKeys.add(dupKey);

      // Resolve assignee: non-admin imports always become their own.
      let assignedToId: string | null = null;
      const assignedEmail = cell(row, "assignedEmail");
      if (admin && assignedEmail) {
        const assignee = await prisma.user.findUnique({
          where: { email: assignedEmail },
          select: { id: true },
        });
        assignedToId = assignee ? assignee.id : null;
      } else if (!admin) {
        assignedToId = user.id;
      }

      // Company: case-insensitive name match, plus website match when
      // a website is present (mirrors the schema's duplicate note).
      const companyWebsite = cell(row, "companyWebsite") || null;
      const nameMatches = await prisma.company.findMany({
        where: { name: { equals: companyName, mode: "insensitive" } },
        select: { id: true, name: true, website: true, assignedToId: true },
      });
      let company = companyWebsite
        ? nameMatches.find(
            (c) => (c.website ?? "").toLowerCase() === companyWebsite.toLowerCase(),
          ) ?? nameMatches[0]
        : nameMatches[0];
      if (!company) {
        company = await prisma.company.create({
          data: {
            name: companyName,
            website: companyWebsite,
            assignedToId: assignedToId ?? user.id,
          },
          select: { id: true, name: true, website: true, assignedToId: true },
        });
      }

      // Contact: same email at the same company is the same contact.
      const contactEmailRaw = cell(row, "contactEmail") || recipientRaw;
      const contactEmail = normalizeEmail(contactEmailRaw);
      const contactName = cell(row, "contactName") || recipientEmail.split("@")[0];
      let contact = await prisma.contact.findFirst({
        where: {
          companyId: company.id,
          email: { equals: contactEmail, mode: "insensitive" },
        },
        select: { id: true },
      });
      if (!contact) {
        contact = await prisma.contact.create({
          data: {
            companyId: company.id,
            fullName: contactName,
            email: contactEmail,
          },
          select: { id: true },
        });
      }

      // Campaign: find by name, else create owned by the importer.
      let campaignId: string | null = null;
      const campaignName = cell(row, "campaignName");
      if (campaignName) {
        const existingCampaign = await prisma.campaign.findFirst({
          where: { name: { equals: campaignName, mode: "insensitive" } },
          select: { id: true },
        });
        if (existingCampaign) {
          campaignId = existingCampaign.id;
        } else {
          const created = await prisma.campaign.create({
            data: { name: campaignName, ownerId: user.id },
            select: { id: true },
          });
          campaignId = created.id;
        }
      }

      const senderEmail = cell(row, "senderEmail") || null;
      if (senderEmail && !EMAIL_RE.test(senderEmail)) {
        fail("senderEmail must be a valid email address");
        continue;
      }

      const activity = await prisma.emailActivity.create({
        data: {
          companyId: company.id,
          contactId: contact.id,
          campaignId,
          recipientEmail,
          senderEmail,
          subject,
          body: cell(row, "body") || subject,
          sequenceNumber,
          status: statusCell as EmailStatus,
          sentAt,
          followUpDate,
          assignedToId,
        },
      });
      await syncFollowUpForActivity(activity);
      await writeAudit(user.id, "EMAIL_ACTIVITY_IMPORTED", "EmailActivity", activity.id, {
        recipientEmail,
        subject,
        status: statusCell,
      });
      imported += 1;
    }

    await writeAudit(user.id, "EMAIL_IMPORT_COMPLETED", "EmailActivity", null, {
      imported,
      skippedDuplicates,
      skippedSuppressed,
      errors,
    });

    return jsonOk({
      imported,
      skippedDuplicates,
      skippedSuppressed,
      errors,
      errorRows,
    });
  });
}
