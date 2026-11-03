"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, btnPrimary, inputCls, Field, ErrorAlert } from "../../emails/ui";

export default function NewCampaignPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  return (
    <div className="max-w-xl">
      <h1 className="text-xl font-semibold text-slate-900">New campaign</h1>
      <p className="mt-1 text-sm text-slate-500">
        A campaign groups tracked emails so results can be counted per
        outreach effort. It does not send emails.
      </p>
      <form
        className="mt-4 space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
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
        <Field label="Campaign name *">
          <input required value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Description">
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className={inputCls} />
        </Field>
        <button type="submit" disabled={saving} className={btnPrimary}>
          {saving ? "Creating…" : "Create campaign"}
        </button>
      </form>
    </div>
  );
}
