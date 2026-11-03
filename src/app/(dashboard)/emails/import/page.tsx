"use client";

import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { ErrorAlert } from "../ui";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ErrorDialog } from "@/components/ui/responsive-dialog";
import { usePagination } from "@/components/use-pagination";
import Pager from "@/components/Pager";

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
  const errorRowsPagination = usePagination(report?.errorRows ?? []);
  const [error, setError] = useState<string | null>(null);
  const [errorDialog, setErrorDialog] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  return (
    <div className="max-w-2xl">
      <Link href="/emails" className="text-base text-brand-700 hover:underline">
        ← All tracked emails
      </Link>
      <h1 className="mt-2 text-xl font-semibold text-slate-900">
        Import sent-email records (CSV)
      </h1>
      <p className="mt-1 text-base text-slate-500">
        Tracking only: this records emails that were already sent separately
        through Gmail. Importing never sends anything. Missing companies and
        contacts are created automatically; rows for suppressed recipients
        and exact duplicates are skipped and counted below.
      </p>

      <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">CSV columns</h2>
        <p className="mt-2 break-words text-sm text-slate-600">{COLUMNS}</p>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-600">
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
            toast.error("Choose a CSV file first");
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
              throw new Error(payload?.error ?? payload?.message ?? `Import failed (${response.status})`);
            }
            const data = payload.data as Report;
            setReport(data);
            toast.success(`Import complete: ${data.imported} imported, ${data.skippedDuplicates} duplicates skipped, ${data.skippedSuppressed} suppressed skipped, ${data.errors} errors.`);
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : "Import failed";
            setError(message);
            toast.error(message);
            setErrorDialog(message);
          } finally {
            setImporting(false);
          }
        }}
      >
        <ErrorAlert message={error} />
        <Label className="block">
          <span className="text-base font-medium text-slate-700">CSV file *</span>
          <input
            type="file"
            accept=".csv,text/csv"
            required
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className={`mt-1`}
          />
        </Label>
        <div className="flex gap-2">
          <Button type="submit" disabled={importing} variant="default">
            {importing ? "Importing…" : "Import records"}
          </Button>
          <Link href="/emails" className="inline-flex min-h-12 items-center rounded-md border border-slate-300 bg-white px-4 py-3 text-base font-medium text-slate-700 hover:bg-slate-100">Back to list</Link>
        </div>
      </form>

      {report ? (
        <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">Import report</h2>
          <ul className="mt-3 space-y-2 text-base">
            <li className="flex justify-between"><span className="text-slate-600">Imported</span><span className="font-medium text-slate-900">{report.imported}</span></li>
            <li className="flex justify-between"><span className="text-slate-600">Skipped — exact duplicates</span><span className="font-medium text-slate-900">{report.skippedDuplicates}</span></li>
            <li className="flex justify-between"><span className="text-slate-600">Skipped — suppressed recipients</span><span className="font-medium text-slate-900">{report.skippedSuppressed}</span></li>
            <li className="flex justify-between"><span className="text-slate-600">Errors</span><span className="font-medium text-slate-900">{report.errors}</span></li>
          </ul>
          {report.errorRows.length > 0 ? (
            <div className="mt-3">
              <h3 className="text-base font-medium text-slate-900">Row errors (first 50)</h3>
              <ul className="mt-2 space-y-1 text-sm text-slate-600">
                {errorRowsPagination.pageItems.map((r) => (
                  <li key={`${r.row}-${r.message}`}>Row {r.row}: {r.message}</li>
                ))}
              </ul>
              {report.errorRows.length > 0 && <Pager page={errorRowsPagination.page} totalPages={errorRowsPagination.totalPages} onPage={errorRowsPagination.setPage} />}
            </div>
          ) : null}
          <Link href="/emails" className="mt-4 inline-block text-base text-brand-700 hover:underline">
            View imported records →
          </Link>
        </section>
      ) : null}

      <ErrorDialog
        open={errorDialog !== null}
        onOpenChange={(o) => !o && setErrorDialog(null)}
        title="Import failed"
        message={errorDialog ?? ""}
        hint="Nothing was imported by the failed attempt. Check the file format and the message above, then try again."
      />
    </div>
  );
}
