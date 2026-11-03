"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, btnPrimary, inputCls, Field, ErrorAlert, TOKEN_HELP } from "../../emails/ui";

export default function NewTemplatePage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-semibold text-slate-900">New email template</h1>
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
            await api("/api/templates", {
              method: "POST",
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
            setError(err instanceof Error ? err.message : "Failed to create template");
          } finally {
            setSaving(false);
          }
        }}
      >
        <ErrorAlert message={error} />
        <Field label="Template name *">
          <input required value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Industry" hint="Leave empty for a general template.">
          <input value={industry} onChange={(e) => setIndustry(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Subject *">
          <input required value={subject} onChange={(e) => setSubject(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Body *">
          <textarea required value={body} onChange={(e) => setBody(e.target.value)} rows={10} className={inputCls} />
        </Field>
        <button type="submit" disabled={saving} className={btnPrimary}>
          {saving ? "Creating…" : "Create template"}
        </button>
      </form>
    </div>
  );
}
