import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import {
  forbidden,
  handleRoute,
  jsonError,
  jsonOk,
  unauthorized,
} from "@/lib/api";
import {
  canCreateLead,
  findDuplicateCompany,
  findDuplicateContact,
  normalizeName,
  normalizeWebsite,
} from "../_scope";

/** Minimal RFC-4180 CSV parser: quoted fields, escaped quotes, CRLF. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      pushField();
    } else if (ch === "\n") {
      pushRow();
    } else if (ch === "\r") {
      // Skip; \n (or EOF) ends the row.
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length > 0) pushRow();
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

function headerKey(header: string): string {
  return header.replace(/[\s_-]+/g, "").toLowerCase();
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/**
 * POST multipart CSV import. No email is sent anywhere.
 * Columns: name, website, industry, country, city, size, linkedinUrl,
 * description, source, status, priority, plus contact columns
 * (contactName, contactEmail, contactJobTitle, contactPhone,
 * contactLinkedinUrl, contactNotes — or bare email/fullName/jobTitle/phone).
 * Exact duplicates (same name + website, or same name with no website,
 * case-insensitive) are skipped and counted, never created twice.
 */
export async function POST(request: Request): Promise<NextResponse> {
  return handleRoute(async () => {
    const user = await requireAuth();
    if (!user) return unauthorized();
    if (!canCreateLead(user))
      return forbidden("Only sales and admins import companies");
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return jsonError("Expected a multipart form with a CSV file", 400);
    }
    const file = form.get("file");
    if (!file || typeof file === "string") {
      return jsonError("Attach a CSV file under the 'file' field", 400);
    }
    const text = await file.text();
    const rows = parseCsv(text.replace(/^\uFEFF/, ""));
    if (rows.length < 2) {
      return jsonError("CSV needs a header row and at least one data row", 400);
    }
    const headers = rows[0].map(headerKey);
    const get = (row: string[], ...keys: string[]): string => {
      for (const key of keys) {
        const idx = headers.indexOf(key);
        if (idx >= 0) return (row[idx] ?? "").trim();
      }
      return "";
    };

    let imported = 0;
    let skipped = 0;
    let duplicates = 0;
    const seenInBatch = new Set<string>();
    const createdIds: string[] = [];

    for (const row of rows.slice(1)) {
      const name = get(row, "name", "companyname", "company");
      if (!name) {
        skipped++;
        continue;
      }
      const website = get(row, "website", "url", "site") || null;
      const dupKey = `${normalizeName(name)}|${normalizeWebsite(website)}`;
      if (seenInBatch.has(dupKey)) {
        duplicates++;
        continue;
      }
      const existing = await findDuplicateCompany(name, website);
      if (existing) {
        duplicates++;
        seenInBatch.add(dupKey);
        continue;
      }
      seenInBatch.add(dupKey);
      const company = await prisma.company.create({
        data: {
          name,
          website: website || null,
          industry: get(row, "industry") || null,
          country: get(row, "country") || null,
          city: get(row, "city") || null,
          size: get(row, "size", "companysize") || null,
          linkedinUrl:
            get(row, "linkedinurl", "companylinkedinurl") || null,
          description: get(row, "description", "notes") || null,
          source: get(row, "source") || null,
          status: get(row, "status") || "NEW",
          priority: get(row, "priority") || "MEDIUM",
          assignedToId:
            user.role === "SALES_EXECUTIVE" ? user.id : undefined,
        },
      });
      imported++;
      createdIds.push(company.id);

      const contactName = get(
        row,
        "contactname",
        "contactfullname",
        "contact",
        "fullname",
        "contactperson",
      );
      const contactEmail = get(row, "contactemail", "email");
      if (contactName && contactEmail && isEmail(contactEmail)) {
        const dupContact = await findDuplicateContact(company.id, contactEmail);
        if (!dupContact) {
          await prisma.contact.create({
            data: {
              companyId: company.id,
              fullName: contactName,
              jobTitle:
                get(row, "contactjobtitle", "jobtitle", "role") || null,
              email: contactEmail,
              linkedinUrl: get(row, "contactlinkedinurl") || null,
              phone: get(row, "contactphone", "phone") || null,
              notes: get(row, "contactnotes") || null,
            },
          });
        }
      }
    }

    await writeAudit(user.id, "COMPANIES_IMPORTED", "Company", null, {
      imported,
      skipped,
      duplicates,
      total: rows.length - 1,
    });
    return jsonOk({
      imported,
      skipped,
      duplicates,
      total: rows.length - 1,
      createdIds,
    });
  });
}
