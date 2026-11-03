"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api, ErrorAlert, TOKEN_HELP, useMe } from "../../emails/ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ErrorDialog } from "@/components/ui/responsive-dialog";
import { FieldError, zodFieldErrors } from "@/components/ui/field-error";
import { templateSchema } from "@/lib/validation";
import PageHeader from "@/components/PageHeader";

type Template = {
  id: string;
  name: string;
  industry: string | null;
  subject: string;
  body: string;
};

export default function TemplateDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { role } = useMe();
  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [errorDialog, setErrorDialog] = useState<string | null>(null);

  async function handleDelete() {
    setDeleting(true);
    try {
      await api(`/api/templates/${params.id}`, { method: "DELETE" });
      toast.success("Template deleted.");
      router.push("/templates");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to delete template";
      setError(message);
      toast.error(message);
      setErrorDialog(message);
      setDeleting(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    api<Template>(`/api/templates/${params.id}`)
      .then((data) => {
        if (cancelled) return;
        setName(data.name);
        setIndustry(data.industry ?? "");
        setSubject(data.subject);
        setBody(data.body);
        setLoaded(true);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load template");
      });
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  if (error) {
    return (
      <div>
        <PageHeader title="Template" backHref="/templates" backLabel="All templates" />
        <div className="mt-4"><ErrorAlert message={error} /></div>
      </div>
    );
  }
  if (!loaded) {
    return (
      <div>
        <PageHeader title="Template" backHref="/templates" backLabel="All templates" />
        <div className="mt-6 space-y-3" aria-label="Loading template">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      </div>
    );
  }

  const canDelete = role === "SUPER_ADMIN" || role === "ADMIN";

  return (
    <div className="max-w-2xl">
      <PageHeader title="Edit template" backHref="/templates" backLabel="All templates" />
      <Card className="mt-6">
        <CardContent className="p-4 text-base text-slate-600 sm:p-6">
          {TOKEN_HELP}
        </CardContent>
      </Card>
      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Template details</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              setError(null);
              const parsed = templateSchema.safeParse({ name, industry: industry || null, subject, body });
              if (!parsed.success) {
                setFieldErrors(zodFieldErrors(parsed));
                return;
              }
              setFieldErrors({});
              setSaving(true);
              try {
                await api(`/api/templates/${params.id}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ name, industry: industry || null, subject, body }),
                });
                toast.success("Template saved.");
                router.push("/templates");
              } catch (err: unknown) {
                const message = err instanceof Error ? err.message : "Failed to save template";
                setError(message);
                toast.error(message);
              } finally {
                setSaving(false);
              }
            }}
          >
            <ErrorAlert message={error} />
            <div className="space-y-2">
              <Label htmlFor="template-name">Template name *</Label>
              <Input id="template-name" required value={name} onChange={(e) => setName(e.target.value)} />
              <FieldError message={fieldErrors.name} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="template-industry">Industry</Label>
              <Input id="template-industry" value={industry} onChange={(e) => setIndustry(e.target.value)} />
              <FieldError message={fieldErrors.industry} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="template-subject">Subject *</Label>
              <Input id="template-subject" required value={subject} onChange={(e) => setSubject(e.target.value)} />
              <FieldError message={fieldErrors.subject} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="template-body">Body *</Label>
              <Textarea id="template-body" required value={body} onChange={(e) => setBody(e.target.value)} rows={10} />
              <FieldError message={fieldErrors.body} />
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
              <Button type="submit" disabled={saving}>
                {saving ? "Saving…" : "Save changes"}
              </Button>
              {canDelete ? (
                <Button
                  type="button"
                  variant="destructive"
                  disabled={deleting}
                  onClick={() => setConfirmDelete(true)}
                >
                  {deleting ? "Deleting…" : "Delete template"}
                </Button>
              ) : (
                <p className="text-sm text-slate-500">
                  Only Admins can delete templates, so live campaigns are not broken.
                </p>
              )}
              <Button type="button" variant="outline" asChild>
                <Link href="/templates">Back to list</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={(o) => !o && setConfirmDelete(false)}
        title="Delete template?"
        description="Delete this template? Recorded emails keep their subject/body, but lose the template link."
        confirmLabel="Delete"
        onConfirm={handleDelete}
        busy={deleting}
      />
      <ErrorDialog
        open={errorDialog !== null}
        onOpenChange={(o) => !o && setErrorDialog(null)}
        title="Could not delete template"
        message={errorDialog ?? ""}
        hint="The template was not deleted. Check the message above and try again."
      />
    </div>
  );
}
