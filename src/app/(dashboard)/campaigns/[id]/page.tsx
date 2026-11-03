"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  api,
  btnPrimary,
  btnDanger,
  btnSecondary,
  inputCls,
  Field,
  ErrorAlert,
  StatusBadge,
  fmtDateTime,
  statusLabel,
} from "../../emails/ui";

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
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

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
        <h1 className="text-xl font-semibold text-slate-900">Campaign</h1>
        <div className="mt-4"><ErrorAlert message={error} /></div>
      </div>
    );
  }
  if (!detail) return <p className="text-sm text-slate-500">Loading campaign…</p>;

  return (
    <div>
      <Link href="/campaigns" className="text-sm text-brand-700 hover:underline">
        ← All campaigns
      </Link>
      <h1 className="mt-2 text-xl font-semibold text-slate-900">{detail.campaign.name}</h1>
      <p className="mt-1 text-sm text-slate-500">
        Owner: {detail.campaign.owner?.name ?? "Unassigned"} · {detail.totalActivities} tracked email(s)
      </p>

      <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Emails by status</h2>
        {detail.countsByStatus.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No tracked emails in this campaign yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {detail.countsByStatus.map((row) => (
              <li key={row.status} className="flex items-center justify-between text-sm">
                <span className="text-slate-600">{statusLabel(row.status)}</span>
                <span className="font-medium text-slate-900">{row.count}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Tracked emails (latest 100)</h2>
        {detail.activities.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">None yet.</p>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-3">Subject</th>
                  <th className="py-2 pr-3">Recipient</th>
                  <th className="py-2 pr-3">Company</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2">Sent</th>
                </tr>
              </thead>
              <tbody>
                {detail.activities.map((a) => (
                  <tr key={a.id} className="border-b border-slate-100 last:border-0">
                    <td className="py-2 pr-3">
                      <Link href={`/emails/${a.id}`} className="text-brand-700 hover:underline">
                        {a.subject}
                      </Link>
                    </td>
                    <td className="py-2 pr-3">{a.recipientEmail}</td>
                    <td className="py-2 pr-3">{a.company.name}</td>
                    <td className="py-2 pr-3"><StatusBadge status={a.status} /></td>
                    <td className="py-2">{fmtDateTime(a.sentAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Edit campaign</h2>
        <form
          className="mt-3 space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            setSaving(true);
            try {
              await api(`/api/campaigns/${params.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name, description: description || null }),
              });
              router.push("/campaigns");
            } catch (err: unknown) {
              setError(err instanceof Error ? err.message : "Failed to save campaign");
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
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={saving} className={btnPrimary}>
              {saving ? "Saving…" : "Save changes"}
            </button>
            <button
              type="button"
              disabled={deleting}
              className={btnDanger}
              onClick={async () => {
                if (!window.confirm("Delete this campaign? Its tracked emails stay, but lose the campaign link.")) return;
                setDeleting(true);
                try {
                  await api(`/api/campaigns/${params.id}`, { method: "DELETE" });
                  router.push("/campaigns");
                } catch (err: unknown) {
                  setError(err instanceof Error ? err.message : "Failed to delete campaign");
                  setDeleting(false);
                }
              }}
            >
              {deleting ? "Deleting…" : "Delete campaign"}
            </button>
            <Link href="/campaigns" className={btnSecondary}>Back to list</Link>
          </div>
        </form>
      </section>
    </div>
  );
}
