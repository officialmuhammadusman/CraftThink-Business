"use client";

import Link from "next/link";
import { useState } from "react";
import { btnPrimary, btnSecondary, inputCls, ErrorAlert } from "../ui";

type Report = {
  imported: number;
  skippedDuplicates: number;
  skippedSuppressed: number;
  errors: number;
  errorRows: { row: number; message: string }[];
};

const COLUMNS =
  "companyName, companyWebsite, contactName, contactEmail, recipientEmail, senderEmail, subject, body, sentAt, campaignName, sequenceNumber, status, followUpDate, assignedEmail";

export default function EmailImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  return (
    <div className="max-w-2xl">
      <Link href="/emails" className="text-sm text-brand-700 hover:underline">
        ← All tracked emails
      </Link>
      <h1 className="mt-2 text-xl font-semibold text-slate-900">
        Import sent-email records (CSV)
      </h1>
      <p className="mt-1 text-sm text-slate-500">
        Tracking only: this records emails that were already sent separately
        through Gmail. Importing never sends anything. Missing companies and
        contacts are created automatically; rows for suppressed recipients
        and exact duplicates are skipped and counted below.
      </p>

      <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">CSV columns</h2>
        <p className="mt-2 break-words text-xs text-slate-600">{COLUMNS}</p>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-slate-600">
          <li>Required: companyName, recipientEmail (or contactEmail), subject.</li>
          <li>companyWebsite helps match an existing company by name + website.</li>
          <li>status defaults to SENT; must be one of: DRAFT, SCHEDULED, SENT, DELIVERED, BOUNCED, REPLIED, POSITIVE, NEGATIVE, FOLLOW_UP_REQUIRED, UNSUBSCRIBED.</li>
          <li>campaignName creates the campaign if it does not exist yet.</li>
          <li>assignedEmail must match an existing user; unknown addresses import as unassigned (non-admin imports always become their own).</li>
          <li>followUpDate creates a follow-up reminder for the row.</li>
          <li>Exact duplicate = same recipient + subject + sentAt; suppressed recipient = address on the Suppression list.</li>
        </ul>
      </section>

      <form
        className="mt-4 space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          setReport(null);
          if (!file) {
            setError("Choose a CSV file first");
            return;
          }
          setImporting(true);
          try {
            const form = new FormData();
            form.append("file", file);
            const response = await fetch("/api/emails/import", {
              method: "POST",
              body: form,
            });
            const payload = await response.json().catch(() => null);
            if (!response.ok) {
              throw new Error(payload?.error ?? `Import failed (${response.status})`);
            }
            setReport(payload.data as Report);
          } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Import failed");
          } finally {
            setImporting(false);
          }
        }}
      >
        <ErrorAlert message={error} />
        <label className="block">
          <span className="text-sm font-medium text-slate-700">CSV file *</span>
          <input
            type="file"
            accept=".csv,text/csv"
            required
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className={`${inputCls} mt-1`}
          />
        </label>
        <div className="flex gap-2">
          <button type="submit" disabled={importing} className={btnPrimary}>
            {importing ? "Importing…" : "Import records"}
          </button>
          <Link href="/emails" className={btnSecondary}>Back to list</Link>
        </div>
      </form>

      {report ? (
        <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">Import report</h2>
          <ul className="mt-3 space-y-2 text-sm">
            <li className="flex justify-between"><span className="text-slate-600">Imported</span><span className="font-medium text-slate-900">{report.imported}</span></li>
            <li className="flex justify-between"><span className="text-slate-600">Skipped — exact duplicates</span><span className="font-medium text-slate-900">{report.skippedDuplicates}</span></li>
            <li className="flex justify-between"><span className="text-slate-600">Skipped — suppressed recipients</span><span className="font-medium text-slate-900">{report.skippedSuppressed}</span></li>
            <li className="flex justify-between"><span className="text-slate-600">Errors</span><span className="font-medium text-slate-900">{report.errors}</span></li>
          </ul>
          {report.errorRows.length > 0 ? (
            <div className="mt-3">
              <h3 className="text-sm font-medium text-slate-900">Row errors (first 50)</h3>
              <ul className="mt-2 space-y-1 text-xs text-slate-600">
                {report.errorRows.map((r) => (
                  <li key={`${r.row}-${r.message}`}>Row {r.row}: {r.message}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <Link href="/emails" className="mt-4 inline-block text-sm text-brand-700 hover:underline">
            View imported records →
          </Link>
        </section>
      ) : null}
    </div>
  );
}
