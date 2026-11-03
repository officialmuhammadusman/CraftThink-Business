"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((p) => setMe(p.data?.user ?? null))
      .catch(() => undefined);
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setNotice(null);
    if (newPassword.length < 8) {
      setNotice("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setNotice("New passwords do not match.");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (!response.ok) {
        setNotice(await readError(response, "Failed to change password"));
        return;
      }
      setNotice("Password changed. Use the new password at your next sign-in.");
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
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-password">New password (min 8 characters)</Label>
              <Input id="new-password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm new password</Label>
              <Input id="confirm-password" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
            </div>
            <Button type="submit" disabled={saving} className="w-full sm:w-auto">
              {saving ? "Saving…" : "Change password"}
            </Button>
            {notice && <p className="text-base text-slate-600">{notice}</p>}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
