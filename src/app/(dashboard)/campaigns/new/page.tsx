"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { api, ErrorAlert } from "../../emails/ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FieldError, zodFieldErrors } from "@/components/ui/field-error";
import { campaignSchema } from "@/lib/validation";
import PageHeader from "@/components/PageHeader";

export default function NewCampaignPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  return (
    <div className="max-w-xl">
      <PageHeader
        title="New campaign"
        subtitle="A campaign groups tracked emails so results can be counted per outreach effort. It does not send emails."
        backHref="/campaigns"
        backLabel="All campaigns"
      />
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Campaign details</CardTitle>
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
                await api("/api/campaigns", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ name, description: description || null }),
                });
                toast.success("Campaign created.");
                router.push("/campaigns");
              } catch (err: unknown) {
                const message = err instanceof Error ? err.message : "Failed to create campaign";
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
            <div className="sticky bottom-0 z-10 -mx-4 border-t border-slate-200 bg-white px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
              <Button type="submit" disabled={saving} className="w-full sm:w-auto">
                {saving ? "Creating…" : "Create campaign"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
