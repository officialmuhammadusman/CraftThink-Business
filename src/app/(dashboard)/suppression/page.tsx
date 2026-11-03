"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { MoreHorizontal } from "lucide-react";
import { api, ErrorAlert, useMe, fmtDateTime } from "../emails/ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ErrorDialog } from "@/components/ui/responsive-dialog";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import Pager from "@/components/Pager";

type Row = {
  id: string;
  email: string;
  reason: string | null;
  scope: string;
  createdAt: string;
};

export default function SuppressionPage() {
  const { role } = useMe();
  const [items, setItems] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmRow, setConfirmRow] = useState<Row | null>(null);
  const [errorDialog, setErrorDialog] = useState<string | null>(null);

  const [newEmail, setNewEmail] = useState("");
  const [newReason, setNewReason] = useState("");
  const [newScope, setNewScope] = useState("GLOBAL");
  const [creating, setCreating] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editReason, setEditReason] = useState("");
  const [editScope, setEditScope] = useState("GLOBAL");
  const [savingEdit, setSavingEdit] = useState(false);

  const load = (p: number, s: string) => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(p), limit: "10" });
    if (s) params.set("search", s);
    api<{ items: Row[]; total: number; totalPages: number }>(
      `/api/suppression?${params}`,
    )
      .then((data) => {
        setItems(data.items);
        setTotal(data.total);
        setTotalPages(data.totalPages);
        setError(null);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load suppression list");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load(page, appliedSearch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, appliedSearch]);

  const canAdd = role === "SUPER_ADMIN" || role === "ADMIN" || role === "SALES_EXECUTIVE";
  const canEdit = role === "SUPER_ADMIN" || role === "ADMIN";
  const canDelete = role === "SUPER_ADMIN";

  async function saveEdit(row: Row) {
    setSavingEdit(true);
    try {
      await api(`/api/suppression/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: editReason || null, scope: editScope }),
      });
      setEditingId(null);
      toast.success("Entry updated.");
      load(page, appliedSearch);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to update entry";
      setError(message);
      toast.error(message);
    } finally {
      setSavingEdit(false);
    }
  }

  async function removeEntry(row: Row) {
    try {
      await api(`/api/suppression/${row.id}`, { method: "DELETE" });
      toast.success(`${row.email} removed from the suppression list.`);
      load(page, appliedSearch);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to remove entry";
      setError(message);
      toast.error(message);
      setErrorDialog(message);
    }
  }

  function rowActions(row: Row) {
    if (editingId === row.id) {
      return (
        <span className="flex flex-col gap-2 sm:flex-row">
          <Button type="button" disabled={savingEdit} onClick={() => saveEdit(row)}>Save</Button>
          <Button type="button" variant="outline" onClick={() => setEditingId(null)}>Cancel</Button>
        </span>
      );
    }
    if (!canEdit && !canDelete) return null;
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" size="icon" className="min-h-12 min-w-12" aria-label={`Actions for ${row.email}`}>
            <MoreHorizontal className="size-5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {canEdit ? (
            <DropdownMenuItem
              onClick={() => {
                setEditingId(row.id);
                setEditReason(row.reason ?? "");
                setEditScope(row.scope);
              }}
            >
              Edit
            </DropdownMenuItem>
          ) : null}
          {canDelete ? (
            <DropdownMenuItem className="text-red-600" onClick={() => setConfirmRow(row)}>
              Remove
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <div>
      <PageHeader
        title="Suppression list"
        subtitle="Anyone on this list must not be emailed again. CSV imports skip suppressed recipients, and marking an email Unsubscribed adds its recipient here automatically."
      />
      <Card className="mt-6 border-amber-200 bg-amber-50">
        <CardHeader>
          <CardTitle>Compliance note</CardTitle>
        </CardHeader>
        <CardContent className="text-base text-amber-900">
          <p>
            This list is a tracking and compliance record. Removing an entry is
            Super-Admin-only, because a mistaken removal re-exposes someone who
            asked to stop.
          </p>
        </CardContent>
      </Card>

      {canAdd ? (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>Add to suppression list</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="grid grid-cols-1 gap-4 sm:grid-cols-3"
              onSubmit={async (e) => {
                e.preventDefault();
                setError(null);
                setCreating(true);
                try {
                  await api("/api/suppression", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ email: newEmail, reason: newReason || null, scope: newScope || "GLOBAL" }),
                  });
                  setNewEmail("");
                  setNewReason("");
                  toast.success(`${newEmail} added to the suppression list.`);
                  load(page, appliedSearch);
                } catch (err: unknown) {
                  const message = err instanceof Error ? err.message : "Failed to add entry";
                  setError(message);
                  toast.error(message);
                } finally {
                  setCreating(false);
                }
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="suppression-email">Email *</Label>
                <Input id="suppression-email" required type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="suppression-reason">Reason</Label>
                <Input id="suppression-reason" value={newReason} onChange={(e) => setNewReason(e.target.value)} placeholder="e.g. Unsubscribed, bounced" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="suppression-scope">Scope</Label>
                <Input id="suppression-scope" value={newScope} onChange={(e) => setNewScope(e.target.value)} />
              </div>
              <div className="sm:col-span-3">
                <Button type="submit" disabled={creating} className="w-full sm:w-auto">
                  {creating ? "Adding…" : "Add to suppression list"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : (
        <p className="mt-4 text-base text-slate-500">
          Only Super Admins, Admins, and Sales Executives can add entries.
        </p>
      )}

      <Card className="mt-4">
        <CardContent className="p-4 sm:p-6">
          <form
            className="flex flex-col gap-2 sm:flex-row"
            onSubmit={(e) => {
              e.preventDefault();
              setPage(1);
              setAppliedSearch(search.trim());
            }}
          >
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by email…" aria-label="Search by email" className="flex-1" />
            <Button type="submit">Search</Button>
          </form>
        </CardContent>
      </Card>

      <div className="mt-4">
        <ErrorAlert message={error} />
        {loading ? (
          <div className="space-y-3" aria-label="Loading suppression list">
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            image="/images/empty-generic.svg"
            title="No suppressed addresses yet"
            description="Suppressed addresses appear here when added above or when an email is marked Unsubscribed."
            action={
              canAdd ? (
                <Button type="button" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
                  Add an entry
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <p className="text-base text-slate-500">{total} entr(ies)</p>
            <div className="mt-3 grid gap-3 md:hidden">
              {items.map((row) => (
                <Card key={row.id}>
                  <CardContent className="space-y-3 p-4">
                    <p className="break-all text-base font-medium text-slate-900">{row.email}</p>
                    {editingId === row.id ? (
                      <>
                        <div className="space-y-2">
                          <Label htmlFor={`edit-reason-${row.id}`}>Reason</Label>
                          <Input id={`edit-reason-${row.id}`} value={editReason} onChange={(e) => setEditReason(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor={`edit-scope-${row.id}`}>Scope</Label>
                          <Input id={`edit-scope-${row.id}`} value={editScope} onChange={(e) => setEditScope(e.target.value)} />
                        </div>
                      </>
                    ) : (
                      <p className="text-base text-slate-600">
                        {row.reason ?? "—"} · <Badge variant="purple">{row.scope}</Badge>
                      </p>
                    )}
                    <p className="text-sm text-slate-500">Added {fmtDateTime(row.createdAt)}</p>
                    {rowActions(row)}
                  </CardContent>
                </Card>
              ))}
            </div>
            <div className="mt-3 hidden overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="sticky top-0 bg-white">Email</TableHead>
                    <TableHead className="sticky top-0 bg-white">Reason</TableHead>
                    <TableHead className="sticky top-0 bg-white">Scope</TableHead>
                    <TableHead className="sticky top-0 bg-white">Added</TableHead>
                    <TableHead className="sticky top-0 bg-white">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((row) => (
                    <TableRow key={row.id} className="align-top">
                      <TableCell className="py-2 font-medium">{row.email}</TableCell>
                      <TableCell className="py-2">
                        {editingId === row.id ? (
                          <Input value={editReason} onChange={(e) => setEditReason(e.target.value)} aria-label="Reason" />
                        ) : (
                          row.reason ?? "—"
                        )}
                      </TableCell>
                      <TableCell className="py-2">
                        {editingId === row.id ? (
                          <Input value={editScope} onChange={(e) => setEditScope(e.target.value)} aria-label="Scope" />
                        ) : (
                          <Badge variant="purple">{row.scope}</Badge>
                        )}
                      </TableCell>
                      <TableCell className="py-2 text-sm text-slate-500">{fmtDateTime(row.createdAt)}</TableCell>
                      <TableCell className="py-2">{rowActions(row)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <Pager page={page} totalPages={totalPages} onPage={setPage} />
          </>
        )}
      </div>

      <ConfirmDialog
        open={confirmRow !== null}
        onOpenChange={(o) => !o && setConfirmRow(null)}
        title="Remove from suppression list?"
        description={
          confirmRow
            ? `Remove ${confirmRow.email} from the suppression list? They could then be emailed again. Only do this if the suppression was a mistake.`
            : ""
        }
        confirmLabel="Remove"
        onConfirm={async () => {
          if (confirmRow) await removeEntry(confirmRow);
        }}
      />
      <ErrorDialog
        open={errorDialog !== null}
        onOpenChange={(o) => !o && setErrorDialog(null)}
        title="Could not remove entry"
        message={errorDialog ?? ""}
        hint="The entry was not removed. Check the message above and try again."
      />
    </div>
  );
}
