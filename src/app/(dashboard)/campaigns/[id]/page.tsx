"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api, ErrorAlert, StatusBadge, fmtDateTime } from "../../emails/ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { usePagination } from "@/components/use-pagination";
import Pager from "@/components/Pager";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ErrorDialog } from "@/components/ui/responsive-dialog";
import { FieldError, zodFieldErrors } from "@/components/ui/field-error";
import { campaignSchema } from "@/lib/validation";
import PageHeader from "@/components/PageHeader";

type Activity = {
  id: string;
  subject: string;
  recipientEmail: string;
  status: string;
  sentAt: string | null;
  company: { id: string; name: string };
  contact: { id: string; fullName: string } | null;
};
type Detail = {
  campaign: {
    id: string;
    name: string;
    description: string | null;
    owner: { name: string; email: string } | null;
  };
  countsByStatus: { status: string; count: number }[];
  totalActivities: number;
  activities: Activity[];
};

export default function CampaignDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [detail, setDetail] = useState<Detail | null>(null);
  const activitiesPagination = usePagination(detail?.activities ?? []);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [errorDialog, setErrorDialog] = useState<string | null>(null);

  async function handleDelete() {
    setDeleting(true);
    try {
      await api(`/api/campaigns/${params.id}`, { method: "DELETE" });
      toast.success("Campaign deleted.");
      router.push("/campaigns");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to delete campaign";
      setError(message);
      toast.error(message);
      setErrorDialog(message);
      setDeleting(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    api<Detail>(`/api/campaigns/${params.id}`)
      .then((data) => {
        if (cancelled) return;
        setDetail(data);
        setName(data.campaign.name);
        setDescription(data.campaign.description ?? "");
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load campaign");
      });
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  if (error) {
    return (
      <div>
        <PageHeader title="Campaign" backHref="/campaigns" backLabel="All campaigns" />
        <div className="mt-4"><ErrorAlert message={error} /></div>
      </div>
    );
  }
  if (!detail) {
    return (
      <div>
        <PageHeader title="Campaign" backHref="/campaigns" backLabel="All campaigns" />
        <div className="mt-6 space-y-3" aria-label="Loading campaign">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={detail.campaign.name}
        subtitle={`Owner: ${detail.campaign.owner?.name ?? "Unassigned"} · ${detail.totalActivities} tracked email(s)`}
        backHref="/campaigns"
        backLabel="All campaigns"
      />
      {detail.campaign.description ? (
        <p className="mt-4 text-base text-slate-600">{detail.campaign.description}</p>
      ) : null}

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Emails by status</CardTitle>
        </CardHeader>
        <CardContent>
          {detail.countsByStatus.length === 0 ? (
            <p className="text-base text-slate-500">No tracked emails in this campaign yet.</p>
          ) : (
            <ul className="space-y-2">
              {detail.countsByStatus.map((row) => (
                <li key={row.status} className="flex flex-wrap items-center justify-between gap-2 text-base">
                  <StatusBadge status={row.status} />
                  <span className="font-medium text-slate-900">{row.count}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Tracked emails (latest 100)</CardTitle>
          <CardDescription>Tap an email to open its record.</CardDescription>
        </CardHeader>
        <CardContent>
          {detail.activities.length === 0 ? (
            <p className="text-base text-slate-500">None yet.</p>
          ) : (
            <>
              <div className="grid gap-3 md:hidden">
                {activitiesPagination.pageItems.map((a) => (
                  <Card key={a.id}>
                    <CardContent className="p-4">
                      <Link href={`/emails/${a.id}`} className="inline-flex min-h-12 items-center text-base font-medium text-brand-600 hover:underline">
                        {a.subject}
                      </Link>
                      <p className="text-base text-slate-600">{a.recipientEmail} · {a.company.name}</p>
                      <p className="mt-2 flex flex-wrap items-center gap-2">
                        <StatusBadge status={a.status} />
                        <span className="text-sm text-slate-500">{fmtDateTime(a.sentAt)}</span>
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
              <div className="hidden overflow-x-auto md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="sticky top-0 bg-white">Subject</TableHead>
                      <TableHead className="sticky top-0 bg-white">Recipient</TableHead>
                      <TableHead className="sticky top-0 bg-white">Company</TableHead>
                      <TableHead className="sticky top-0 bg-white">Status</TableHead>
                      <TableHead className="sticky top-0 bg-white">Sent</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {activitiesPagination.pageItems.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell className="py-2">
                          <Link href={`/emails/${a.id}`} className="font-medium text-brand-600 hover:underline">
                            {a.subject}
                          </Link>
                        </TableCell>
                        <TableCell className="py-2">{a.recipientEmail}</TableCell>
                        <TableCell className="py-2">{a.company.name}</TableCell>
                        <TableCell className="py-2"><StatusBadge status={a.status} /></TableCell>
                        <TableCell className="py-2">{fmtDateTime(a.sentAt)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {detail.activities.length > 0 && <Pager page={activitiesPagination.page} totalPages={activitiesPagination.totalPages} onPage={activitiesPagination.setPage} />}
            </>
          )}
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Edit campaign</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              setError(null);
              const parsed = campaignSchema.safeParse({ name, description: description || null });
              if (!parsed.success) {
                setFieldErrors(zodFieldErrors(parsed));
                return;
              }
              setFieldErrors({});
              setSaving(true);
              try {
                await api(`/api/campaigns/${params.id}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ name, description: description || null }),
                });
                toast.success("Campaign saved.");
                router.push("/campaigns");
              } catch (err: unknown) {
                const message = err instanceof Error ? err.message : "Failed to save campaign";
                setError(message);
                toast.error(message);
              } finally {
                setSaving(false);
              }
            }}
          >
            <ErrorAlert message={error} />
            <div className="space-y-2">
              <Label htmlFor="campaign-name">Campaign name *</Label>
              <Input id="campaign-name" required value={name} onChange={(e) => setName(e.target.value)} />
              <FieldError message={fieldErrors.name} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="campaign-description">Description</Label>
              <Textarea id="campaign-description" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
              <FieldError message={fieldErrors.description} />
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <Button type="submit" disabled={saving}>
                {saving ? "Saving…" : "Save changes"}
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={deleting}
                onClick={() => setConfirmDelete(true)}
              >
                {deleting ? "Deleting…" : "Delete campaign"}
              </Button>
              <Button type="button" variant="outline" asChild>
                <Link href="/campaigns">Back to list</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={(o) => !o && setConfirmDelete(false)}
        title="Delete campaign?"
        description="Delete this campaign? Its tracked emails stay, but lose the campaign link."
        confirmLabel="Delete"
        onConfirm={handleDelete}
        busy={deleting}
      />
      <ErrorDialog
        open={errorDialog !== null}
        onOpenChange={(o) => !o && setErrorDialog(null)}
        title="Could not delete campaign"
        message={errorDialog ?? ""}
        hint="The campaign was not deleted. Check the message above and try again."
      />
    </div>
  );
}
