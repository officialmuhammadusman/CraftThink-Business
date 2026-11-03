"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { api, ErrorAlert, TOKEN_HELP } from "../../emails/ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FieldError, zodFieldErrors } from "@/components/ui/field-error";
import { templateSchema } from "@/lib/validation";
import PageHeader from "@/components/PageHeader";

export default function NewTemplatePage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="New email template"
        backHref="/templates"
        backLabel="All templates"
      />
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
                await api("/api/templates", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ name, industry: industry || null, subject, body }),
                });
                toast.success("Template created.");
                router.push("/templates");
              } catch (err: unknown) {
                const message = err instanceof Error ? err.message : "Failed to create template";
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
              <p className="text-sm text-slate-500">Leave empty for a general template.</p>
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
            <div className="sticky bottom-0 z-10 -mx-4 border-t border-slate-200 bg-white px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
              <Button type="submit" disabled={saving} className="w-full sm:w-auto">
                {saving ? "Creating…" : "Create template"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
