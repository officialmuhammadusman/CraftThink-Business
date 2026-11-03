"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { usePagination } from "@/components/use-pagination";
import Pager from "@/components/Pager";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ResponsiveDialog, ErrorDialog } from "@/components/ui/responsive-dialog";
import { FieldError, zodFieldErrors } from "@/components/ui/field-error";
import { quoteLineItemSchema } from "@/lib/validation";
import { SUPPORTED_CURRENCIES } from "@/lib/currency";

const QUOTE_STATUSES = ["DRAFT", "SENT", "ACCEPTED", "REJECTED"];

type LineItem = {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  position: number;
};

type Quote = {
  id: string;
  title: string;
  currency: string;
  status: string;
  notes: string | null;
  total: number;
  deal: { id: string; title: string; status: string } | null;
  company: { id: string; name: string };
  createdBy: { id: string; name: string } | null;
  lineItems: LineItem[];
  createdAt: string;
  updatedAt: string;
};

const inputCls =
  "flex min-h-12 w-full rounded-md border border-slate-300 bg-white px-3 py-3 text-base text-slate-900";

async function readError(response: Response, fallback: string): Promise<string> {
  const payload = await response.json().catch(() => null);
  return payload?.error ?? fallback;
}

export default function QuoteDetailPage({ params }: { params: { id: string } }) {
  const [quote, setQuote] = useState<Quote | null>(null);
  const linesPagination = usePagination(quote?.lineItems ?? []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [edit, setEdit] = useState({ title: "", currency: "USD", status: "DRAFT", notes: "" });
  const [editBusy, setEditBusy] = useState(false);
  const [lineForm, setLineForm] = useState({ description: "", quantity: "1", unitPrice: "" });
  const [lineErrors, setLineErrors] = useState<Record<string, string>>({});
  const [lineBusy, setLineBusy] = useState(false);
  const [confirmLine, setConfirmLine] = useState<LineItem | null>(null);
  const [errorDialog, setErrorDialog] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/quotes/${params.id}`);
      if (!response.ok) throw new Error(await readError(response, "Failed to load quote"));
      const payload = await response.json();
      const data = payload.data as Quote;
      setQuote(data);
      setEdit({
        title: data.title,
        currency: data.currency,
        status: data.status,
        notes: data.notes ?? "",
      });
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load quote";
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

  async function saveEdit(event: FormEvent) {
    event.preventDefault();
    if (!quote) return;
    setEditBusy(true);
    try {
      const response = await fetch(`/api/quotes/${params.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: edit.title,
          currency: edit.currency,
          status: edit.status,
          notes: edit.notes || null,
        }),
      });
      if (!response.ok) {
        toast.error(await readError(response, "Could not save quote"));
        return;
      }
      toast.success("Quote saved. Accepting a quote does not move the deal stage — move the deal explicitly on the Deals page.");
      setEditing(false);
      load();
    } finally {
      setEditBusy(false);
    }
  }

  async function addLine(event: FormEvent) {
    event.preventDefault();
    const parsed = quoteLineItemSchema.safeParse({
      description: lineForm.description,
      quantity: Number(lineForm.quantity),
      unitPrice: Number(lineForm.unitPrice),
      position: 0,
    });
    const errs = zodFieldErrors(parsed);
    if (Object.keys(errs).length > 0) {
      setLineErrors(errs);
      return;
    }
    setLineErrors({});
    setLineBusy(true);
    try {
      const response = await fetch(`/api/quotes/${params.id}/lines`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: lineForm.description,
          quantity: Number(lineForm.quantity),
          unitPrice: Number(lineForm.unitPrice),
        }),
      });
      if (!response.ok) {
        toast.error(await readError(response, "Could not add line item"));
        return;
      }
      toast.success("Line item added. The total is recomputed from line items.");
      setLineForm({ description: "", quantity: "1", unitPrice: "" });
      load();
    } finally {
      setLineBusy(false);
    }
  }

  async function deleteLine(line: LineItem) {
    const response = await fetch(`/api/quotes/${params.id}/lines/${line.id}`, { method: "DELETE" });
    if (!response.ok) {
      const message = await readError(response, "Could not delete line item");
      toast.error(message);
      setErrorDialog(message);
      return;
    }
    toast.success("Line item deleted.");
    load();
  }

  if (loading) {
    return (
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Quote</h1>
        <p className="mt-4 text-base text-slate-500">Loading…</p>
      </div>
    );
  }

  if (error || !quote) {
    return (
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Quote</h1>
        <p role="alert" className="mt-4 rounded-md bg-red-50 px-3 py-2 text-base text-red-700">
          {error ?? "Quote not found."}
        </p>
        <Link href="/deals/quotes" className="mt-3 inline-block text-base text-brand-600 hover:underline">
          Back to quotes
        </Link>
      </div>
    );
  }

  return (
    <div>
      <Link href="/deals/quotes" className="text-base text-brand-600 hover:underline">
        ← Back to quotes
      </Link>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-slate-900">{quote.title}</h1>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={() => window.print()}>
            Print quote
          </Button>
          <Button type="button" onClick={() => setEditing(true)}>
            Edit
          </Button>
        </div>
      </div>

      {/* Printable view: the print stylesheet in globals.css shows only
          this section when printing (browser print, no PDF service). */}
      <section className="quote-print mt-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Quote — {quote.title}</h2>
        <p className="mt-1 flex flex-wrap gap-2">
          <Badge>{quote.status}</Badge>
          <Badge variant="secondary">{quote.currency}</Badge>
        </p>
        <dl className="mt-4 grid grid-cols-1 gap-2 text-base sm:grid-cols-2">
          <div><dt className="text-slate-500">Company</dt><dd className="text-slate-900">{quote.company.name}</dd></div>
          <div><dt className="text-slate-500">Deal</dt><dd className="text-slate-900">{quote.deal ? `${quote.deal.title} (${quote.deal.status.replaceAll("_", " ")})` : "Deal deleted — quote kept via company link"}</dd></div>
          <div><dt className="text-slate-500">Created by</dt><dd className="text-slate-900">{quote.createdBy?.name ?? "—"}</dd></div>
          <div><dt className="text-slate-500">Created</dt><dd className="text-slate-900">{new Date(quote.createdAt).toLocaleString()}</dd></div>
          {quote.notes && <div className="sm:col-span-2"><dt className="text-slate-500">Notes</dt><dd className="text-slate-900">{quote.notes}</dd></div>}
        </dl>
        <table className="mt-5 w-full text-base">
          <thead>
            <tr className="border-b text-left text-slate-500">
              <th className="py-2 pr-2">Description</th>
              <th className="py-2 pr-2">Qty</th>
              <th className="py-2 pr-2">Unit price</th>
              <th className="py-2">Line total</th>
            </tr>
          </thead>
          <tbody>
            {quote.lineItems.length === 0 && (
              <tr><td colSpan={4} className="py-3 text-slate-500">No line items yet.</td></tr>
            )}
            {quote.lineItems.map((li) => (
              <tr key={li.id} className="border-b">
                <td className="py-2 pr-2">{li.description}</td>
                <td className="py-2 pr-2">{li.quantity}</td>
                <td className="py-2 pr-2">{quote.currency} {li.unitPrice.toLocaleString()}</td>
                <td className="py-2">{quote.currency} {(li.quantity * li.unitPrice).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3} className="py-3 text-right font-semibold text-slate-900">Total (computed from line items)</td>
              <td className="py-3 font-semibold text-slate-900">{quote.currency} {quote.total.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</td>
            </tr>
          </tfoot>
        </table>
        <p className="mt-3 text-sm text-slate-500">
          Accepting this quote does not change the deal stage. The deal is moved explicitly on the Deals page.
        </p>
      </section>

      <ResponsiveDialog
        open={editing}
        onOpenChange={setEditing}
        title="Edit quote"
        description="The total is never edited here — it is computed from line items."
      >
        <form onSubmit={saveEdit} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Label className="text-base font-medium text-slate-700">
            Title
            <Input value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} className="mt-1" />
          </Label>
          <Label className="text-base font-medium text-slate-700">
            Currency
            <Select value={edit.currency} onValueChange={(v) => setEdit({ ...edit, currency: v })}>
              <SelectTrigger className="mt-1 min-h-12 text-base"><SelectValue /></SelectTrigger>
              <SelectContent>
                {SUPPORTED_CURRENCIES.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Label>
          <Label className="text-base font-medium text-slate-700">
            Status
            <Select value={edit.status} onValueChange={(v) => setEdit({ ...edit, status: v })}>
              <SelectTrigger className="mt-1 min-h-12 text-base"><SelectValue /></SelectTrigger>
              <SelectContent>
                {QUOTE_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Label>
          <Label className="text-base font-medium text-slate-700 sm:col-span-2">
            Notes
            <Textarea value={edit.notes} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} rows={2} className="mt-1" />
          </Label>
          <Button type="submit" disabled={editBusy} className="justify-self-start">
            {editBusy ? "Saving…" : "Save changes"}
          </Button>
        </form>
      </ResponsiveDialog>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Line items</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {quote.lineItems.length === 0 ? (
            <p className="text-base text-slate-500">No line items yet. Add the first one below.</p>
          ) : (
            <>
            <ul className="space-y-2">
              {linesPagination.pageItems.map((li) => (
                <li key={li.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-slate-50 px-3 py-2 text-base">
                  <span>
                    <span className="font-medium text-slate-900">{li.description}</span>
                    <span className="block text-slate-600">
                      {li.quantity} × {quote.currency} {li.unitPrice.toLocaleString()} = {quote.currency}{" "}
                      {(li.quantity * li.unitPrice).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                    </span>
                  </span>
                  <Button type="button" variant="ghost" className="text-red-600 hover:text-red-700" onClick={() => setConfirmLine(li)}>
                    Delete
                  </Button>
                </li>
              ))}
            </ul>
            {quote.lineItems.length > 0 && <Pager page={linesPagination.page} totalPages={linesPagination.totalPages} onPage={linesPagination.setPage} />}
            </>
          )}
          <form onSubmit={addLine} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Label className="text-base font-medium text-slate-700">
              Description *
              <Input required value={lineForm.description} onChange={(e) => setLineForm({ ...lineForm, description: e.target.value })} className="mt-1" />
              <FieldError message={lineErrors.description} />
            </Label>
            <Label className="text-base font-medium text-slate-700">
              Quantity *
              <Input required type="number" min="0" step="any" value={lineForm.quantity} onChange={(e) => setLineForm({ ...lineForm, quantity: e.target.value })} className="mt-1" />
              <FieldError message={lineErrors.quantity} />
            </Label>
            <Label className="text-base font-medium text-slate-700">
              Unit price ({quote.currency}) *
              <Input required type="number" min="0" step="0.01" value={lineForm.unitPrice} onChange={(e) => setLineForm({ ...lineForm, unitPrice: e.target.value })} className="mt-1" />
              <FieldError message={lineErrors.unitPrice} />
            </Label>
            <Button type="submit" disabled={lineBusy} className="justify-self-start">
              {lineBusy ? "Adding…" : "Add line item"}
            </Button>
          </form>
          <p className="text-sm text-slate-500">
            Total shown above is computed server-side as sum(quantity × unitPrice). There is no field for typing a total.
          </p>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={!!confirmLine}
        onOpenChange={(o) => !o && setConfirmLine(null)}
        title="Delete line item"
        description={confirmLine ? `Delete line item "${confirmLine.description}"? The total will recompute.` : ""}
        confirmLabel="Delete"
        onConfirm={async () => {
          if (confirmLine) await deleteLine(confirmLine);
          setConfirmLine(null);
        }}
      />
      <ErrorDialog
        open={errorDialog !== null}
        onOpenChange={(o) => !o && setErrorDialog(null)}
        title="Action failed"
        message={errorDialog ?? ""}
        hint="Nothing was changed by the failed step. Check the message above and try again."
      />
    </div>
  );
}
