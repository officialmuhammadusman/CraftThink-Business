"use client";

import { Suspense, useCallback, useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ResponsiveDialog, ErrorDialog } from "@/components/ui/responsive-dialog";
import { FieldError, zodFieldErrors } from "@/components/ui/field-error";
import { quoteSchema } from "@/lib/validation";
import { SUPPORTED_CURRENCIES } from "@/lib/currency";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";

const QUOTE_STATUSES = ["DRAFT", "SENT", "ACCEPTED", "REJECTED"];

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
  lineItems: { id: string; description: string; quantity: number; unitPrice: number }[];
  createdAt: string;
};

type Deal = { id: string; title: string };

const inputCls =
  "flex min-h-12 w-full rounded-md border border-slate-300 bg-white px-3 py-3 text-base text-slate-900";

async function readError(response: Response, fallback: string): Promise<string> {
  const payload = await response.json().catch(() => null);
  return payload?.error ?? fallback;
}

function QuotesInner() {
  const searchParams = useSearchParams();
  const presetDeal = searchParams.get("dealId") ?? "";
  const [items, setItems] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [dealFilter, setDealFilter] = useState(presetDeal);
  const [statusFilter, setStatusFilter] = useState("");
  const [confirmQuote, setConfirmQuote] = useState<Quote | null>(null);
  const [errorDialog, setErrorDialog] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    dealId: presetDeal,
    title: "",
    currency: "USD",
    status: "DRAFT",
    notes: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: "100" });
      if (dealFilter) params.set("dealId", dealFilter);
      if (statusFilter) params.set("status", statusFilter);
      const response = await fetch(`/api/quotes?${params}`);
      if (!response.ok) throw new Error(await readError(response, "Failed to load quotes"));
      const payload = await response.json();
      setItems(payload.data.items as Quote[]);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load quotes";
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [dealFilter, statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    fetch("/api/deals?limit=100")
      .then((r) => r.json())
      .then((p) => setDeals(p.data?.items ?? []))
      .catch(() => undefined);
  }, []);

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    const parsed = quoteSchema.safeParse({
      dealId: form.dealId || null,
      title: form.title,
      currency: form.currency || "USD",
      status: form.status,
      notes: form.notes || null,
    });
    const errs = zodFieldErrors(parsed);
    if (!form.dealId) errs.dealId = "A quote needs a deal.";
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      return;
    }
    setFieldErrors({});
    setSubmitting(true);
    try {
      const response = await fetch("/api/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dealId: form.dealId,
          title: form.title,
          currency: form.currency || "USD",
          status: form.status,
          notes: form.notes || null,
        }),
      });
      if (!response.ok) {
        toast.error(await readError(response, "Could not create quote"));
        return;
      }
      toast.success("Quote created. Add line items on its detail page — the total is computed from them.");
      setForm({ ...form, title: "", notes: "" });
      load();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(quote: Quote) {
    const response = await fetch(`/api/quotes/${quote.id}`, { method: "DELETE" });
    if (!response.ok) {
      const message = await readError(response, "Could not delete quote");
      toast.error(message);
      setErrorDialog(message);
      return;
    }
    toast.success("Quote deleted.");
    load();
  }

  return (
    <div>
      <PageHeader
        title="Quotes"
        subtitle="Quotes belong to deals (DEALS permission applies). Totals are computed from line items — never typed by hand. Accepting a quote does NOT move the deal stage; move the deal explicitly on the Deals page."
        action={
          <Button variant="outline" asChild>
            <Link href="/deals">Back to deals</Link>
          </Button>
        }
      />

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>New quote</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <label className="block space-y-2 text-base font-medium text-slate-700">
                Deal *
                <Select value={form.dealId || "__none"} onValueChange={(v) => setForm({ ...form, dealId: v === "__none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="Select deal…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">Select deal…</SelectItem>
                    {deals.map((d) => (
                      <SelectItem key={d.id} value={d.id}>{d.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldError message={fieldErrors.dealId} />
              </label>
              <label className="block space-y-2 text-base font-medium text-slate-700">
                Title *
                <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={inputCls} />
                <FieldError message={fieldErrors.title} />
              </label>
              <label className="block space-y-2 text-base font-medium text-slate-700">
                Currency
                <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SUPPORTED_CURRENCIES.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldError message={fieldErrors.currency} />
              </label>
              <label className="block space-y-2 text-base font-medium text-slate-700">
                Status
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {QUOTE_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldError message={fieldErrors.status} />
              </label>
              <label className="block space-y-2 text-base font-medium text-slate-700 sm:col-span-2">
                Notes
                <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} className={inputCls} />
                <FieldError message={fieldErrors.notes} />
              </label>
            </div>
            <Button type="submit" disabled={submitting} className="w-full sm:w-auto">
              {submitting ? "Creating…" : "Create quote"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block space-y-2 text-base font-medium text-slate-700">
          Filter by deal
          <Select value={dealFilter || "all"} onValueChange={(v) => setDealFilter(v === "all" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="Any deal" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any deal</SelectItem>
              {deals.map((d) => (
                <SelectItem key={d.id} value={d.id}>{d.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <label className="block space-y-2 text-base font-medium text-slate-700">
          Filter by status
          <Select value={statusFilter || "all"} onValueChange={(v) => setStatusFilter(v === "all" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="Any status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any status</SelectItem>
              {QUOTE_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded-md bg-red-50 px-3 py-3 text-base text-red-700">{error}</p>
      )}
      {loading ? (
        <div className="mt-4 space-y-3" aria-label="Loading quotes">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
      ) : items.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            image="/images/empty-deals.svg"
            title="No quotes yet"
            description="Create one above, then add line items on its detail page."
            action={
              <Button type="button" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
                Create a quote
              </Button>
            }
          />
        </div>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((q) => (
            <Card key={q.id}>
              <CardContent className="space-y-2 p-4">
                <p className="text-base font-medium text-slate-900">{q.title}</p>
                <p className="flex flex-wrap gap-2">
                  <Badge>{q.status}</Badge>
                  <Badge variant="secondary">
                    {q.currency} {q.total.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                  </Badge>
                </p>
                <p className="text-base text-slate-500">
                  {q.company.name}
                  {q.deal ? ` · Deal: ${q.deal.title}` : " · Deal deleted"}
                </p>
                <p className="text-sm text-slate-500">
                  {q.lineItems.length} line item(s)
                  {q.createdBy ? ` · by ${q.createdBy.name}` : ""}
                </p>
                <Button type="button" variant="outline" className="w-full" asChild>
                  <Link href={`/deals/quotes/${q.id}`}>Open quote</Link>
                </Button>
                <Button type="button" variant="ghost" className="w-full text-red-600 hover:text-red-700" onClick={() => setConfirmQuote(q)}>
                  Delete
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={confirmQuote !== null}
        onOpenChange={(o) => !o && setConfirmQuote(null)}
        title="Delete quote?"
        description={confirmQuote ? `Delete quote "${confirmQuote.title}" and its line items?` : ""}
        confirmLabel="Delete"
        onConfirm={async () => {
          if (confirmQuote) await handleDelete(confirmQuote);
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

export default function QuotesPage() {
  return (
    <Suspense fallback={<p className="text-base text-slate-500">Loading quotes…</p>}>
      <QuotesInner />
    </Suspense>
  );
}
