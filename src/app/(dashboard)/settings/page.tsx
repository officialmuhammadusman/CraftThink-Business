"use client";

import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError, zodFieldErrors } from "@/components/ui/field-error";
import { changePasswordSchema } from "@/lib/validation";
import PageHeader from "@/components/PageHeader";

async function readError(response: Response, fallback: string): Promise<string> {
  const payload = await response.json().catch(() => null);
  return payload?.error ?? fallback;
}

export default function SettingsPage() {
  const [me, setMe] = useState<{ name: string; email: string; role: string } | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((p) => setMe(p.data?.user ?? null))
      .catch(() => undefined);
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = changePasswordSchema.safeParse({ currentPassword, newPassword });
    const errs = zodFieldErrors(parsed);
    if (newPassword !== confirmPassword) {
      errs.confirmPassword = "New passwords do not match.";
    }
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      return;
    }
    setFieldErrors({});
    setSaving(true);
    try {
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (!response.ok) {
        toast.error(await readError(response, "Failed to change password"));
        return;
      }
      toast.success("Password changed. Use the new password at your next sign-in.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-xl">
      <PageHeader
        title="Settings"
        subtitle={me ? `Signed in as ${me.name} (${me.email}) — ${me.role.replaceAll("_", " ")}` : undefined}
      />
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Change your password</CardTitle>
          <CardDescription>Your new password applies at your next sign-in.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="current-password">Current password</Label>
              <Input id="current-password" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
              <FieldError message={fieldErrors.currentPassword} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-password">New password (min 8 characters)</Label>
              <Input id="new-password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
              <FieldError message={fieldErrors.newPassword} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm new password</Label>
              <Input id="confirm-password" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
              <FieldError message={fieldErrors.confirmPassword} />
            </div>
            <Button type="submit" disabled={saving} className="w-full sm:w-auto">
              {saving ? "Saving…" : "Change password"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
