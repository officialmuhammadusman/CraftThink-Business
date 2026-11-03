"use client";

import { useEffect, useState, type FormEvent } from "react";

const inputCls =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900";
const btnPrimary =
  "rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50";

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
    <div>
      <h1 className="text-2xl font-semibold text-slate-900">Settings</h1>
      {me && (
        <p className="mt-1 text-sm text-slate-500">
          Signed in as {me.name} ({me.email}) — {me.role.replaceAll("_", " ")}
        </p>
      )}
      <form onSubmit={handleSubmit} className="mt-6 max-w-md rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-base font-semibold text-slate-900">Change your password</h2>
        <div className="mt-3 grid gap-3">
          <label className="text-sm text-slate-600">
            Current password
            <input className={inputCls} type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
          </label>
          <label className="text-sm text-slate-600">
            New password (min 8 characters)
            <input className={inputCls} type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          </label>
          <label className="text-sm text-slate-600">
            Confirm new password
            <input className={inputCls} type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
          </label>
        </div>
        <button className={`${btnPrimary} mt-4`} type="submit" disabled={saving}>
          {saving ? "Saving…" : "Change password"}
        </button>
        {notice && <p className="mt-2 text-sm text-slate-600">{notice}</p>}
      </form>
    </div>
  );
}
