"use client";

import * as React from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from "recharts";
import { cn } from "@/lib/utils";

const CHART_COLORS = [
  "#4f46e5",
  "#0ea5e9",
  "#14b8a6",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#64748b",
];

function ChartEmpty({ label }: { label: string }) {
  return (
    <div className="flex h-56 items-center justify-center rounded-md border border-dashed border-slate-200 bg-slate-50/50 px-4 text-center">
      <p className="text-base text-slate-500">
        No data yet for {label}. Records you add will appear here.
      </p>
    </div>
  );
}

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2 shadow-md">
      <p className="text-sm font-medium text-slate-900">{label}</p>
      {payload.map((p: any) => (
        <p key={String(p.dataKey)} className="text-base text-slate-600">
          {p.name}: <span className="font-semibold text-slate-900">{p.value}</span>
        </p>
      ))}
    </div>
  );
}

export function AreaTrendChart({
  data,
  dataKey,
  label,
  className,
}: {
  data: { label: string; value: number }[];
  dataKey?: string;
  label: string;
  className?: string;
}) {
  const hasData = data.some((d) => d.value > 0);
  if (!hasData) return <ChartEmpty label={label} />;
  return (
    <div className={cn("h-64 w-full", className)}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 13 }} stroke="#64748b" />
          <YAxis allowDecimals={false} tick={{ fontSize: 13 }} stroke="#64748b" />
          <Tooltip content={<ChartTooltip />} />
          <Area
            type="monotone"
            dataKey="value"
            name={label}
            stroke="#4f46e5"
            fill="#4f46e5"
            fillOpacity={0.15}
            strokeWidth={2}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function BarCountChart({
  data,
  label,
  className,
  layout = "horizontal",
}: {
  data: { label: string; value: number }[];
  label: string;
  className?: string;
  layout?: "horizontal" | "vertical";
}) {
  const hasData = data.some((d) => d.value > 0);
  if (!hasData) return <ChartEmpty label={label} />;
  const vertical = layout === "vertical";
  return (
    <div className={cn("h-64 w-full", className)}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout={vertical ? "vertical" : "horizontal"}
          margin={{ top: 8, right: 8, left: vertical ? 8 : -12, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={!vertical} vertical={vertical} />
          {vertical ? (
            <>
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 13 }} stroke="#64748b" />
              <YAxis type="category" dataKey="label" width={110} tick={{ fontSize: 13 }} stroke="#64748b" />
            </>
          ) : (
            <>
              <XAxis dataKey="label" tick={{ fontSize: 13 }} stroke="#64748b" />
              <YAxis allowDecimals={false} tick={{ fontSize: 13 }} stroke="#64748b" />
            </>
          )}
          <Tooltip content={<ChartTooltip />} cursor={{ fill: "#f1f5f9" }} />
          <Bar dataKey="value" name={label} radius={[6, 6, 0, 0]}>
            {data.map((_, i) => (
              <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function Sparkline({
  data,
  className,
}: {
  data: number[];
  className?: string;
}) {
  const points = data.map((v, i) => ({ label: String(i), value: v }));
  if (!data.some((v) => v > 0)) return null;
  return (
    <div className={cn("h-10 w-28", className)}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
          <Area
            type="monotone"
            dataKey="value"
            stroke="#4f46e5"
            fill="#4f46e5"
            fillOpacity={0.2}
            strokeWidth={2}
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export { CHART_COLORS };
