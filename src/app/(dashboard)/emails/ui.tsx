"use client";

import { useEffect, useState } from "react";

export const inputCls =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900";
export const selectCls = inputCls;
export const btnPrimary =
  "rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50";
export const btnSecondary =
  "rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50";
export const btnDanger =
  "rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50";

export const TOKEN_HELP =
  "Placeholders you can use in a template subject or body: {{company}} = company name, {{contactName}} = contact full name, {{senderName}} = your name. When you pick a template while recording an email, these are replaced with the real values. Templates never send anything on their own.";

export const EMAIL_STATUSES = [
  "DRAFT",
  "SCHEDULED",
  "SENT",
  "DELIVERED",
  "BOUNCED",
  "REPLIED",
  "POSITIVE",
  "NEGATIVE",
  "FOLLOW_UP_REQUIRED",
  "UNSUBSCRIBED",
];

export const TERMINAL_STATUSES = [
  "REPLIED",
  "POSITIVE",
  "NEGATIVE",
  "UNSUBSCRIBED",
  "BOUNCED",
];

export function statusLabel(status: string): string {
  return status.replaceAll("_", " ");
}

export function fmtDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString();
}

export function fmtDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

/** ISO string -> datetime-local input value (local time). */
export function toLocalInput(value: string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function nowLocalInput(): string {
  return toLocalInput(new Date().toISOString());
}

/** datetime-local input value -> ISO string (or null when empty). */
export function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error ?? `Request failed (${response.status})`);
  }
  return payload.data as T;
}

export function useMe(): {
  role: string | null;
  name: string | null;
  loading: boolean;
} {
  const [role, setRole] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me")
      .then(async (r) => {
        const payload = await r.json().catch(() => null);
        if (!cancelled && r.ok && payload?.data?.user) {
          setRole(payload.data.user.role as string);
          setName(payload.data.user.name as string);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return { role, name, loading };
}

export function StatusBadge({
  status,
  suppressed,
}: {
  status: string;
  suppressed?: boolean;
}) {
  const color =
    status === "POSITIVE"
      ? "bg-green-100 text-green-800"
      : status === "NEGATIVE" || status === "BOUNCED"
        ? "bg-red-100 text-red-800"
        : status === "REPLIED"
          ? "bg-blue-100 text-blue-800"
          : status === "FOLLOW_UP_REQUIRED"
            ? "bg-amber-100 text-amber-800"
            : status === "UNSUBSCRIBED"
              ? "bg-purple-100 text-purple-800"
              : "bg-slate-100 text-slate-700";
  return (
    <span className="inline-flex flex-wrap gap-1">
      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>
        {status === "BOUNCED" ? "Bounced — flagged" : statusLabel(status)}
      </span>
      {suppressed ? (
        <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-800">
          Suppressed
        </span>
      ) : null}
    </span>
  );
}

export function ErrorAlert({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
      {message}
    </p>
  );
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <span className="mt-1 block">{children}</span>
      {hint ? <span className="mt-1 block text-xs text-slate-500">{hint}</span> : null}
    </label>
  );
}
