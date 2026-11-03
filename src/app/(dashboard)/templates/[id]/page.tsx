"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  api,
  btnPrimary,
  btnDanger,
  inputCls,
  Field,
  ErrorAlert,
  TOKEN_HELP,
  useMe,
} from "../../emails/ui";

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
        <h1 className="text-xl font-semibold text-slate-900">Template</h1>
        <div className="mt-4"><ErrorAlert message={error} /></div>
      </div>
    );
  }
  if (!loaded) return <p className="text-sm text-slate-500">Loading template…</p>;

  const canDelete = role === "SUPER_ADMIN" || role === "ADMIN";

  return (
    <div className="max-w-2xl">
      <Link href="/templates" className="text-sm text-brand-700 hover:underline">
        ← All templates
      </Link>
      <h1 className="mt-2 text-xl font-semibold text-slate-900">Edit template</h1>
      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600 shadow-sm">
        {TOKEN_HELP}
      </div>
      <form
        className="mt-4 space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          setSaving(true);
          try {
            await api(`/api/templates/${params.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                name,
                industry: industry || null,
                subject,
                body,
              }),
            });
            router.push("/templates");
          } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Failed to save template");
          } finally {
            setSaving(false);
          }
        }}
      >
        <ErrorAlert message={error} />
        <Field label="Template name *">
          <input required value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Industry">
          <input value={industry} onChange={(e) => setIndustry(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Subject *">
          <input required value={subject} onChange={(e) => setSubject(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Body *">
          <textarea required value={body} onChange={(e) => setBody(e.target.value)} rows={10} className={inputCls} />
        </Field>
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={saving} className={btnPrimary}>
            {saving ? "Saving…" : "Save changes"}
          </button>
          {canDelete ? (
            <button
              type="button"
              disabled={deleting}
              className={btnDanger}
              onClick={async () => {
                if (!window.confirm("Delete this template? Recorded emails keep their subject/body, but lose the template link.")) return;
                setDeleting(true);
                try {
                  await api(`/api/templates/${params.id}`, { method: "DELETE" });
                  router.push("/templates");
                } catch (err: unknown) {
                  setError(err instanceof Error ? err.message : "Failed to delete template");
                  setDeleting(false);
                }
              }}
            >
              {deleting ? "Deleting…" : "Delete template"}
            </button>
          ) : (
            <p className="text-xs text-slate-500 self-center">
              Only Admins can delete templates, so live campaigns are not broken.
            </p>
          )}
        </div>
      </form>
    </div>
  );
}
