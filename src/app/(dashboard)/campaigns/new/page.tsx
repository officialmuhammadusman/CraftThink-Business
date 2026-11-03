"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, ErrorAlert } from "../../emails/ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import PageHeader from "@/components/PageHeader";

export default function NewCampaignPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
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
              setSaving(true);
              try {
                await api("/api/campaigns", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ name, description: description || null }),
                });
                router.push("/campaigns");
              } catch (err: unknown) {
                setError(err instanceof Error ? err.message : "Failed to create campaign");
              } finally {
                setSaving(false);
              }
            }}
          >
            <ErrorAlert message={error} />
            <div className="space-y-2">
              <Label htmlFor="campaign-name">Campaign name *</Label>
              <Input id="campaign-name" required value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="campaign-description">Description</Label>
              <Textarea id="campaign-description" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
            </div>
            <Button type="submit" disabled={saving} className="w-full sm:w-auto">
              {saving ? "Creating…" : "Create campaign"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
