"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";

export const inputCls =
  "flex min-h-12 w-full rounded-md border border-slate-300 bg-white px-3 py-3 text-base text-slate-900";
export const selectCls = inputCls;
export const btnPrimary =
  "inline-flex min-h-12 items-center justify-center rounded-md bg-brand-600 px-4 py-3 text-base font-medium text-white hover:bg-brand-700 disabled:opacity-50";
export const btnSecondary =
  "inline-flex min-h-12 items-center justify-center rounded-md border border-slate-300 bg-white px-4 py-3 text-base font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50";
export const btnDanger =
  "inline-flex min-h-12 items-center justify-center rounded-md bg-red-600 px-4 py-3 text-base font-medium text-white hover:bg-red-700 disabled:opacity-50";

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
  const variant =
    status === "POSITIVE"
      ? "success"
      : status === "NEGATIVE" || status === "BOUNCED"
        ? "destructive"
        : status === "REPLIED"
          ? "info"
          : status === "FOLLOW_UP_REQUIRED"
            ? "warning"
            : status === "UNSUBSCRIBED"
              ? "purple"
              : "secondary";
  return (
    <span className="inline-flex flex-wrap gap-1">
      <Badge variant={variant}>
        {status === "BOUNCED" ? "Bounced — flagged" : statusLabel(status)}
      </Badge>
      {suppressed ? <Badge variant="purple">Suppressed</Badge> : null}
    </span>
  );
}

export function ErrorAlert({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-md bg-red-50 px-3 py-3 text-base text-red-700">
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
      <span className="text-base font-medium text-slate-700">{label}</span>
      <span className="mt-1 block">{children}</span>
      {hint ? <span className="mt-1 block text-sm text-slate-500">{hint}</span> : null}
    </label>
  );
}
