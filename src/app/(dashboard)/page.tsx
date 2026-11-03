"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AreaTrendChart,
  BarCountChart,
  Sparkline,
} from "@/components/ui/chart";
import { DateRangePicker } from "@/components/ui/date-picker";

type CountRow = { status: string; count: number };
type MeetingRow = {
  id: string;
  title: string;
  dateTime: string;
  platform: string | null;
  company: { id: string; name: string };
  contact: { id: string; fullName: string } | null;
};
type ActivityRow = {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  createdAt: string;
  actor: { id: string; name: string; email: string } | null;
};
type Stats = {
  totalCompanies: number;
  companiesByStatus: CountRow[];
  emailsSent: number;
  emailsByStatus: CountRow[];
  responses: number;
  positiveResponses: number;
  negativeResponses: number;
  followUpsDueToday: number;
  followUpsOverdue: number;
  upcomingMeetingsCount: number;
  upcomingMeetings: MeetingRow[];
  dealsByStage: CountRow[];
  activeProjects: number;
  projectsByStatus: CountRow[];
  recentActivity: ActivityRow[];
};

type CoverageEmail = {
  id: string;
  subject: string;
  status: string;
  recipientEmail: string;
  date: string;
};
type CoverageFollowUp = {
  id: string;
  dueDate: string;
  status: string;
  reason: string | null;
};
type CoverageCompany = {
  id: string;
  name: string;
  website: string | null;
  country: string;
  city: string;
  industry: string;
  companyStatus: string;
  contacted: boolean;
  contactedDate: string | null;
  emailsSent: number;
  emails: CoverageEmail[];
  replyStatus: string | null;
  hasReplied: boolean;
  interested: boolean;
  nextFollowUpDue: string | null;
  followUps: CoverageFollowUp[];
};
type CoverageGroup = {
  country: string;
  city: string;
  industry: string;
  discovered: number;
  contacted: number;
  notContacted: number;
};
type Coverage = {
  totals: {
    discovered: number;
    contacted: number;
    notContacted: number;
    replied: number;
    interested: number;
  };
  groups: CoverageGroup[];
  companies: CoverageCompany[];
};

type Charts = {
  range: { from: string; to: string };
  emailsOverTime: { label: string; value: number }[];
  funnel: { label: string; value: number }[];
  leadsByCountry: { label: string; value: number }[];
  leadsByIndustry: { label: string; value: number }[];
  dealsByStage: { label: string; value: number }[];
  followUpsDueByDay: { label: string; value: number }[];
  wonRevenue: { label: string; value: number }[] | null;
};

type StatusFilter = "ALL" | "CONTACTED" | "NOT_CONTACTED" | "REPLIED" | "INTERESTED";

function isoToday(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function KpiCard({
  label,
  value,
  hint,
  spark,
}: {
  label: string;
  value: string;
  hint: string;
  spark?: number[];
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-base font-medium text-slate-500">{label}</p>
            <p className="mt-1 text-3xl font-semibold tabular-nums text-slate-900">{value}</p>
            <p className="mt-1 text-sm text-slate-500">{hint}</p>
          </div>
          {spark ? <Sparkline data={spark} /> : null}
        </div>
      </CardContent>
    </Card>
  );
}

function Breakdown({
  title,
  rows,
  emptyText,
}: {
  title: string;
  rows: CountRow[];
  emptyText: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        {rows.length === 0 ? (
          <p className="mt-2 text-base text-slate-500">{emptyText}</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {rows.map((row) => (
              <li
                key={row.status}
                className="flex items-center justify-between text-base"
              >
                <span className="text-slate-600">
                  {row.status.replaceAll("_", " ")}
                </span>
                <span className="font-medium text-slate-900">{row.count}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [coverage, setCoverage] = useState<Coverage | null>(null);
  const [coverageError, setCoverageError] = useState<string | null>(null);
  const [charts, setCharts] = useState<Charts | null>(null);
  const [chartsError, setChartsError] = useState<string | null>(null);
  const [preset, setPreset] = useState<"7d" | "30d" | "90d" | "custom">("30d");
  const [range, setRange] = useState({ from: isoToday(-29), to: isoToday(0) });
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [countryFilter, setCountryFilter] = useState("ALL");
  const [industryFilter, setIndustryFilter] = useState("ALL");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/dashboard/stats")
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(payload?.error ?? "Failed to load dashboard stats");
        }
        if (!cancelled) setStats(payload.data as Stats);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load stats");
        }
      });
    fetch("/api/dashboard/coverage")
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(payload?.error ?? "Failed to load coverage");
        }
        if (!cancelled) setCoverage(payload.data as Coverage);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setCoverageError(
            err instanceof Error ? err.message : "Failed to load coverage",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setChartsError(null);
    fetch(`/api/dashboard/charts?from=${range.from}&to=${range.to}`)
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(payload?.error ?? "Failed to load charts");
        }
        if (!cancelled) setCharts(payload.data as Charts);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setChartsError(
            err instanceof Error ? err.message : "Failed to load charts",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [range]);

  function applyPreset(value: "7d" | "30d" | "90d" | "custom") {
    setPreset(value);
    if (value === "7d") setRange({ from: isoToday(-6), to: isoToday(0) });
    if (value === "30d") setRange({ from: isoToday(-29), to: isoToday(0) });
    if (value === "90d") setRange({ from: isoToday(-89), to: isoToday(0) });
  }

  const countries = useMemo(
    () =>
      coverage
        ? [...new Set(coverage.companies.map((c) => c.country))].sort()
        : [],
    [coverage],
  );
  const industries = useMemo(
    () =>
      coverage
        ? [...new Set(coverage.companies.map((c) => c.industry))].sort()
        : [],
    [coverage],
  );
  const filteredCompanies = (coverage?.companies ?? []).filter((c) => {
    if (statusFilter === "CONTACTED" && !c.contacted) return false;
    if (statusFilter === "NOT_CONTACTED" && c.contacted) return false;
    if (statusFilter === "REPLIED" && !c.hasReplied) return false;
    if (statusFilter === "INTERESTED" && !c.interested) return false;
    if (countryFilter !== "ALL" && c.country !== countryFilter) return false;
    if (industryFilter !== "ALL" && c.industry !== industryFilter)
      return false;
    return true;
  });

  if (error) {
    return (
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Dashboard</h1>
        <p role="alert" className="mt-4 rounded-md bg-red-50 px-3 py-2 text-base text-red-700">
          {error}
        </p>
      </div>
    );
  }

  if (!stats) {
    return (
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Dashboard</h1>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Loading dashboard">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
      </div>
    );
  }

  const dealsWon =
    stats.dealsByStage.find((r) => r.status === "WON")?.count ?? 0;
  const positiveRate =
    stats.responses > 0
      ? `${Math.round((stats.positiveResponses / stats.responses) * 100)}%`
      : "—";
  const emailSpark = charts?.emailsOverTime.map((p) => p.value) ?? [];

  return (
    <div className="space-y-6">
      {/* Header + date range */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          <span aria-hidden="true" className="mt-1 flex shrink-0 items-end gap-1">
            <span className="block h-6 w-1.5 rounded-full bg-brand-600" />
            <span className="block h-4 w-1.5 rounded-full bg-indigo-400" />
            <span className="block h-2.5 w-1.5 rounded-full bg-indigo-300" />
          </span>
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Dashboard</h1>
            <p className="mt-1 text-base text-slate-500">
              Live counts from the database — zero means no records yet, not a
              placeholder.
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Select
            value={preset}
            onValueChange={(v) => applyPreset(v as "7d" | "30d" | "90d" | "custom")}
          >
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue placeholder="Range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="90d">Last 90 days</SelectItem>
              <SelectItem value="custom">Custom range</SelectItem>
            </SelectContent>
          </Select>
          {preset === "custom" ? (
            <DateRangePicker
              value={range}
              onChange={setRange}
              className="w-full sm:w-auto"
            />
          ) : null}
        </div>
      </div>

      {/* KPI strip: exactly 4 cards, then the chart grid. Other counts live
          in the breakdown cards below so the strip stays scannable. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Leads" value={String(stats.totalCompanies)} hint="All companies in the pipeline" />
        <KpiCard label="Emails sent" value={String(stats.emailsSent)} hint="Sent, delivered, replied, or followed up" spark={emailSpark} />
        <KpiCard label="Positive rate" value={positiveRate} hint="Positive replies out of all responses" />
        <KpiCard label="Deals won" value={String(dealsWon)} hint="Deals in the Won stage" />
      </div>

      {/* Charts */}
      <div>
        <h2 className="text-xl font-semibold text-slate-900">Trends</h2>
        <p className="mt-1 text-base text-slate-500">
          Charts use the date range above and only your permitted records.
        </p>
        {chartsError ? (
          <p role="alert" className="mt-3 rounded-md bg-red-50 px-3 py-2 text-base text-red-700">
            {chartsError}
          </p>
        ) : !charts ? (
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <Skeleton className="h-72" />
            <Skeleton className="h-72" />
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-12">
            <Card className="lg:col-span-8">
              <CardHeader>
                <CardTitle>Emails sent over time</CardTitle>
                <CardDescription>
                  Tracked emails per day, {charts.range.from} to {charts.range.to}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <AreaTrendChart data={charts.emailsOverTime} label="Emails sent" />
              </CardContent>
            </Card>
            <Card className="lg:col-span-4">
              <CardHeader>
                <CardTitle>Response funnel</CardTitle>
                <CardDescription>
                  Distinct businesses at each stage, from tracked emails
                </CardDescription>
              </CardHeader>
              <CardContent>
                <BarCountChart data={charts.funnel} label="Businesses" layout="vertical" />
                <p className="mt-3 text-sm tabular-nums text-slate-500">
                  Reply rate:{" "}
                  {charts.funnel[0]?.value
                    ? `${Math.round(((charts.funnel[1]?.value ?? 0) / charts.funnel[0].value) * 100)}%`
                    : "—"}
                  {" · "}Positive rate:{" "}
                  {charts.funnel[1]?.value
                    ? `${Math.round(((charts.funnel[2]?.value ?? 0) / charts.funnel[1].value) * 100)}%`
                    : "—"}
                </p>
              </CardContent>
            </Card>
            <Card className="lg:col-span-4">
              <CardHeader>
                <CardTitle>Leads by country</CardTitle>
                <CardDescription>Top countries in your company list</CardDescription>
              </CardHeader>
              <CardContent>
                <BarCountChart data={charts.leadsByCountry} label="Companies" layout="vertical" />
              </CardContent>
            </Card>
            <Card className="lg:col-span-4">
              <CardHeader>
                <CardTitle>Leads by industry</CardTitle>
                <CardDescription>Top industries in your company list</CardDescription>
              </CardHeader>
              <CardContent>
                <BarCountChart data={charts.leadsByIndustry} label="Companies" layout="vertical" />
              </CardContent>
            </Card>
            <Card className="lg:col-span-4">
              <CardHeader>
                <CardTitle>Deals by stage</CardTitle>
                <CardDescription>How many deals sit in each pipeline stage</CardDescription>
              </CardHeader>
              <CardContent>
                <BarCountChart data={charts.dealsByStage} label="Deals" />
              </CardContent>
            </Card>
            <Card className={charts.wonRevenue ? "lg:col-span-8" : "lg:col-span-12"}>
              <CardHeader>
                <CardTitle>Follow-ups due, next 14 days</CardTitle>
                <CardDescription>Pending follow-ups per day</CardDescription>
              </CardHeader>
              <CardContent>
                <AreaTrendChart data={charts.followUpsDueByDay} label="Follow-ups due" />
              </CardContent>
            </Card>
            {charts.wonRevenue ? (
              <Card className="lg:col-span-4">
                <CardHeader>
                  <CardTitle>Won deal value by month</CardTitle>
                  <CardDescription>
                    Final price (or estimated budget) for won deals, by
                    expected close month. Shown only because won deals with
                    budget figures exist.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <BarCountChart data={charts.wonRevenue} label="Value (USD)" />
                </CardContent>
              </Card>
            ) : null}
          </div>
        )}
      </div>

      {/* COVERAGE — headline view */}
      <Card><CardContent className="p-4">
        <h2 className="text-base font-semibold text-slate-900">
          Coverage — places covered &amp; businesses contacted
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Contacted = has at least one tracked email record. A business with
          no email record counts as not-yet-contacted. Replied = a reply,
          positive, or negative email status. Interested = a positive reply.
        </p>
        {coverageError ? (
          <p role="alert" className="mt-3 rounded-md bg-red-50 px-3 py-2 text-base text-red-700">
            {coverageError}
          </p>
        ) : !coverage ? (
          <Skeleton className="mt-3 h-24" />
        ) : coverage.companies.length === 0 ? (
          <p className="mt-3 text-base text-slate-500">
            No businesses yet. Once companies are added, this section shows
            coverage by country, city, and industry, and which businesses
            have been contacted.
          </p>
        ) : (
          <>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
              <div>
                <p className="text-sm font-medium text-slate-500">Discovered</p>
                <p className="text-2xl font-semibold text-slate-900">
                  {coverage.totals.discovered}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-slate-500">Contacted</p>
                <p className="text-2xl font-semibold text-slate-900">
                  {coverage.totals.contacted}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-slate-500">
                  Not yet contacted
                </p>
                <p className="text-2xl font-semibold text-slate-900">
                  {coverage.totals.notContacted}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-slate-500">Replied</p>
                <p className="text-2xl font-semibold text-slate-900">
                  {coverage.totals.replied}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-slate-500">Interested</p>
                <p className="text-2xl font-semibold text-slate-900">
                  {coverage.totals.interested}
                </p>
              </div>
            </div>

            <h3 className="mt-6 text-base font-semibold text-slate-900">
              Coverage by country, city &amp; industry
            </h3>
            <div className="mt-2 grid gap-3 md:hidden">
              {coverage.groups.map((g) => (
                <Card key={`${g.country}|${g.city}|${g.industry}`}>
                  <CardContent className="p-4">
                    <p className="text-base font-medium text-slate-900">
                      {g.country} · {g.city}
                    </p>
                    <p className="text-base text-slate-500">{g.industry}</p>
                    <p className="mt-2 text-base text-slate-700">
                      Discovered {g.discovered} · Contacted {g.contacted} ·
                      Not yet contacted {g.notContacted}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
            <div className="mt-2 hidden overflow-x-auto md:block">
              <Table className="w-full min-w-[560px] text-left text-base">
                <TableHeader>
                  <TableRow className="border-b border-slate-200 text-sm uppercase tracking-wide text-slate-500">
                    <TableHead className="py-2 pr-3">Country</TableHead>
                    <TableHead className="py-2 pr-3">City</TableHead>
                    <TableHead className="py-2 pr-3">Industry</TableHead>
                    <TableHead className="py-2 pr-3 text-right tabular-nums">Discovered</TableHead>
                    <TableHead className="py-2 pr-3 text-right tabular-nums">Contacted</TableHead>
                    <TableHead className="py-2 text-right tabular-nums">Not yet contacted</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {coverage.groups.map((g) => (
                    <TableRow
                      key={`${g.country}|${g.city}|${g.industry}`}
                      className="border-b border-slate-100 last:border-0"
                    >
                      <TableCell className="py-2 pr-3">{g.country}</TableCell>
                      <TableCell className="py-2 pr-3">{g.city}</TableCell>
                      <TableCell className="py-2 pr-3">{g.industry}</TableCell>
                      <TableCell className="py-2 pr-3 font-medium tabular-nums text-right">{g.discovered}</TableCell>
                      <TableCell className="py-2 pr-3 tabular-nums text-right">{g.contacted}</TableCell>
                      <TableCell className="py-2 tabular-nums text-right">{g.notContacted}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <h3 className="mt-6 text-base font-semibold text-slate-900">
              Businesses
            </h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {(
                [
                  ["ALL", "All"],
                  ["CONTACTED", "Contacted"],
                  ["NOT_CONTACTED", "Not contacted"],
                  ["REPLIED", "Replied"],
                  ["INTERESTED", "Interested"],
                ] as [StatusFilter, string][]
              ).map(([value, label]) => (
                <Button
                  key={value}
                  type="button"
                  variant={statusFilter === value ? "default" : "outline"}
                  onClick={() => setStatusFilter(value)}
                  aria-pressed={statusFilter === value}
                  className="rounded-full"
                >
                  {label}
                </Button>
              ))}
              <div className="flex min-h-12 items-center gap-2">
                <Label htmlFor="country-filter" className="text-base text-slate-500">
                  Country
                </Label>
                <Select value={countryFilter} onValueChange={setCountryFilter}>
                  <SelectTrigger id="country-filter" className="w-48">
                    <SelectValue placeholder="All countries" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All countries</SelectItem>
                    {countries.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex min-h-12 items-center gap-2">
                <Label htmlFor="industry-filter" className="text-base text-slate-500">
                  Industry
                </Label>
                <Select value={industryFilter} onValueChange={setIndustryFilter}>
                  <SelectTrigger id="industry-filter" className="w-48">
                    <SelectValue placeholder="All industries" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All industries</SelectItem>
                    {industries.map((i) => (
                      <SelectItem key={i} value={i}>
                        {i}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {filteredCompanies.length === 0 ? (
              <p className="mt-3 text-base text-slate-500">
                No businesses match these filters.
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-slate-100">
                {filteredCompanies.map((c) => (
                  <li key={c.id} className="py-3">
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedId(expandedId === c.id ? null : c.id)
                      }
                      aria-expanded={expandedId === c.id}
                      className="block w-full rounded-md px-2 py-2 text-left hover:bg-slate-50"
                    >
                      <span className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="text-base font-medium text-slate-900">
                          {c.name}
                          <span className="ml-2 text-sm font-normal text-slate-500">
                            {c.country} · {c.city} · {c.industry}
                          </span>
                        </span>
                        <Badge
                          variant={
                            c.replyStatus === "POSITIVE"
                              ? "success"
                              : c.replyStatus === "NEGATIVE"
                                ? "destructive"
                                : c.replyStatus === "REPLIED"
                                  ? "info"
                                  : c.contacted
                                    ? "secondary"
                                    : "warning"
                          }
                        >
                          {c.replyStatus
                            ? `Reply: ${c.replyStatus.replaceAll("_", " ")}`
                            : c.contacted
                              ? "Contacted, no reply"
                              : "Not yet contacted"}
                        </Badge>
                      </span>
                      <span className="mt-1 block text-sm text-slate-500">
                        Contacted:{" "}
                        {c.contactedDate
                          ? new Date(c.contactedDate).toLocaleDateString()
                          : "—"}
                        {" · "}Emails: {c.emailsSent}
                        {" · "}Follow-up due:{" "}
                        {c.nextFollowUpDue
                          ? new Date(c.nextFollowUpDue).toLocaleDateString()
                          : "—"}
                        {" · "}Tap to{" "}
                        {expandedId === c.id ? "hide" : "see"} timeline
                      </span>
                    </button>
                    {expandedId === c.id ? (
                      <div className="mt-2 rounded-md bg-slate-50 p-3 text-base">
                        {c.emails.length === 0 ? (
                          <p className="text-slate-500">
                            No tracked emails for this business yet.
                          </p>
                        ) : (
                          <ul className="space-y-1">
                            {c.emails.map((e) => (
                              <li key={e.id} className="text-slate-700">
                                {new Date(e.date).toLocaleDateString()} —{" "}
                                {e.subject} ({e.status.replaceAll("_", " ")})
                                {e.recipientEmail
                                  ? ` → ${e.recipientEmail}`
                                  : ""}
                              </li>
                            ))}
                          </ul>
                        )}
                        <p className="mt-2 text-sm text-slate-500">
                          Follow-ups:{" "}
                          {c.followUps.length === 0
                            ? "none"
                            : c.followUps
                                .map(
                                  (f) =>
                                    `${new Date(f.dueDate).toLocaleDateString()} (${f.status})${f.reason ? ` — ${f.reason}` : ""}`,
                                )
                                .join(" · ")}
                        </p>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </CardContent></Card>

      {/* Breakdowns + activity */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Breakdown
          title="Companies by status"
          rows={stats.companiesByStatus}
          emptyText="No companies yet. Add the first company from the Companies module."
        />
        <Breakdown
          title="Deals by stage"
          rows={stats.dealsByStage}
          emptyText="No deals yet."
        />
        <Breakdown
          title="Emails by status"
          rows={stats.emailsByStatus}
          emptyText="No email activity yet."
        />
        <Breakdown
          title="Responses"
          rows={[
            { status: "RESPONSES", count: stats.responses },
            { status: "POSITIVE", count: stats.positiveResponses },
            { status: "NEGATIVE", count: stats.negativeResponses },
          ]}
          emptyText="No responses yet."
        />
        <Breakdown
          title="Follow-ups"
          rows={[
            { status: "DUE_TODAY", count: stats.followUpsDueToday },
            { status: "OVERDUE", count: stats.followUpsOverdue },
          ]}
          emptyText="No follow-ups due or overdue."
        />
        <Breakdown
          title="Projects & meetings"
          rows={[
            { status: "ACTIVE_PROJECTS", count: stats.activeProjects },
            { status: "UPCOMING_MEETINGS", count: stats.upcomingMeetingsCount },
            {
              status: "DEALS_TOTAL",
              count: stats.dealsByStage.reduce((sum, row) => sum + row.count, 0),
            },
          ]}
          emptyText="No projects or meetings yet."
        />
        <Card><CardContent className="p-4">
          <h2 className="text-base font-semibold text-slate-900">
            Upcoming meetings
          </h2>
          {stats.upcomingMeetings.length === 0 ? (
            <p className="mt-2 text-base text-slate-500">
              No upcoming meetings scheduled.
            </p>
          ) : (
            <ul className="mt-3 space-y-3">
              {stats.upcomingMeetings.map((m) => (
                <li key={m.id} className="text-base">
                  <p className="font-medium text-slate-900">{m.title}</p>
                  <p className="text-slate-500">
                    {new Date(m.dateTime).toLocaleString()} · {m.company.name}
                    {m.contact ? ` · ${m.contact.fullName}` : ""}
                    {m.platform ? ` · ${m.platform}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent></Card>
        <Card className="md:col-span-2"><CardContent className="p-4">
          <h2 className="text-base font-semibold text-slate-900">
            Recent activity
          </h2>
          {stats.recentActivity.length === 0 ? (
            <p className="mt-2 text-base text-slate-500">
              No activity yet. Sign-ins and future module actions will appear
              here.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {stats.recentActivity.map((a) => (
                <li key={a.id} className="text-base text-slate-600">
                  <span className="font-medium text-slate-900">
                    {a.actor?.name ?? "System"}
                  </span>{" "}
                  {a.action} {a.entityType}
                  <span className="text-slate-400">
                    {" "}
                    · {new Date(a.createdAt).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent></Card>
      </div>
    </div>
  );
}
