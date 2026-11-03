"use client";

import { useEffect, useState } from "react";

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

type StatusFilter = "ALL" | "CONTACTED" | "NOT_CONTACTED" | "REPLIED" | "INTERESTED";

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: number;
  hint: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-3xl font-semibold text-slate-900">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{hint}</p>
    </div>
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
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">{emptyText}</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {rows.map((row) => (
            <li
              key={row.status}
              className="flex items-center justify-between text-sm"
            >
              <span className="text-slate-600">
                {row.status.replaceAll("_", " ")}
              </span>
              <span className="font-medium text-slate-900">{row.count}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [coverage, setCoverage] = useState<Coverage | null>(null);
  const [coverageError, setCoverageError] = useState<string | null>(null);
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
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
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

  if (error) {
    return (
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Dashboard</h1>
        <p role="alert" className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      </div>
    );
  }

  if (!stats) {
    return (
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Dashboard</h1>
        <p className="mt-4 text-sm text-slate-500">Loading live stats…</p>
      </div>
    );
  }

  // Coverage filters (applied to the per-business list below the group
  // table; the group table itself always shows the full-coverage totals).
  const countries = coverage
    ? [...new Set(coverage.companies.map((c) => c.country))].sort()
    : [];
  const industries = coverage
    ? [...new Set(coverage.companies.map((c) => c.industry))].sort()
    : [];
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

  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900">Dashboard</h1>
      <p className="mt-1 text-sm text-slate-500">
        Live counts from the database — zero means no records yet, not a
        placeholder.
      </p>

      {/* COVERAGE — headline view: which places are covered, and which
          businesses have been sent cold email to. No charts here. */}
      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">
          Coverage — places covered &amp; businesses contacted
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Contacted = has at least one tracked email record. A business with
          no email record counts as not-yet-contacted. Replied = a reply,
          positive, or negative email status. Interested = a positive reply.
        </p>
        {coverageError ? (
          <p role="alert" className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {coverageError}
          </p>
        ) : !coverage ? (
          <p className="mt-3 text-sm text-slate-500">Loading coverage…</p>
        ) : coverage.companies.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">
            No businesses yet. Once companies are added, this section shows
            coverage by country, city, and industry, and which businesses
            have been contacted.
          </p>
        ) : (
          <>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
              <div>
                <p className="text-xs font-medium text-slate-500">Discovered</p>
                <p className="text-2xl font-semibold text-slate-900">
                  {coverage.totals.discovered}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500">Contacted</p>
                <p className="text-2xl font-semibold text-slate-900">
                  {coverage.totals.contacted}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500">
                  Not yet contacted
                </p>
                <p className="text-2xl font-semibold text-slate-900">
                  {coverage.totals.notContacted}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500">Replied</p>
                <p className="text-2xl font-semibold text-slate-900">
                  {coverage.totals.replied}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500">Interested</p>
                <p className="text-2xl font-semibold text-slate-900">
                  {coverage.totals.interested}
                </p>
              </div>
            </div>

            <h3 className="mt-6 text-sm font-semibold text-slate-900">
              Coverage by country, city &amp; industry
            </h3>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                    <th className="py-2 pr-3">Country</th>
                    <th className="py-2 pr-3">City</th>
                    <th className="py-2 pr-3">Industry</th>
                    <th className="py-2 pr-3">Discovered</th>
                    <th className="py-2 pr-3">Contacted</th>
                    <th className="py-2">Not yet contacted</th>
                  </tr>
                </thead>
                <tbody>
                  {coverage.groups.map((g) => (
                    <tr
                      key={`${g.country}|${g.city}|${g.industry}`}
                      className="border-b border-slate-100 last:border-0"
                    >
                      <td className="py-2 pr-3">{g.country}</td>
                      <td className="py-2 pr-3">{g.city}</td>
                      <td className="py-2 pr-3">{g.industry}</td>
                      <td className="py-2 pr-3 font-medium">{g.discovered}</td>
                      <td className="py-2 pr-3">{g.contacted}</td>
                      <td className="py-2">{g.notContacted}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h3 className="mt-6 text-sm font-semibold text-slate-900">
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
                <button
                  key={value}
                  type="button"
                  onClick={() => setStatusFilter(value)}
                  aria-pressed={statusFilter === value}
                  className={`rounded-full border px-3 py-1 text-xs font-medium ${
                    statusFilter === value
                      ? "border-brand-600 bg-brand-600 text-white"
                      : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  {label}
                </button>
              ))}
              <label className="text-xs text-slate-500">
                Country{" "}
                <select
                  value={countryFilter}
                  onChange={(e) => setCountryFilter(e.target.value)}
                  className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900"
                >
                  <option value="ALL">All countries</option>
                  {countries.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-slate-500">
                Industry{" "}
                <select
                  value={industryFilter}
                  onChange={(e) => setIndustryFilter(e.target.value)}
                  className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900"
                >
                  <option value="ALL">All industries</option>
                  {industries.map((i) => (
                    <option key={i} value={i}>
                      {i}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {filteredCompanies.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">
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
                      className="block w-full text-left"
                    >
                      <span className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="text-sm font-medium text-slate-900">
                          {c.name}
                          <span className="ml-2 text-xs font-normal text-slate-500">
                            {c.country} · {c.city} · {c.industry}
                          </span>
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            c.replyStatus === "POSITIVE"
                              ? "bg-green-100 text-green-800"
                              : c.replyStatus === "NEGATIVE"
                                ? "bg-red-100 text-red-800"
                                : c.replyStatus === "REPLIED"
                                  ? "bg-blue-100 text-blue-800"
                                  : c.contacted
                                    ? "bg-slate-100 text-slate-700"
                                    : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {c.replyStatus
                            ? `Reply: ${c.replyStatus.replaceAll("_", " ")}`
                            : c.contacted
                              ? "Contacted, no reply"
                              : "Not yet contacted"}
                        </span>
                      </span>
                      <span className="mt-1 block text-xs text-slate-500">
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
                      <div className="mt-2 rounded-md bg-slate-50 p-3 text-sm">
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
                        <p className="mt-2 text-xs text-slate-500">
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
      </section>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Companies"
          value={stats.totalCompanies}
          hint="All companies in the pipeline"
        />
        <StatCard
          label="Emails sent"
          value={stats.emailsSent}
          hint="Sent, delivered, replied, or followed up"
        />
        <StatCard
          label="Responses"
          value={stats.responses}
          hint={`${stats.positiveResponses} positive · ${stats.negativeResponses} negative`}
        />
        <StatCard
          label="Active projects"
          value={stats.activeProjects}
          hint="Planning, in progress, review, or testing"
        />
        <StatCard
          label="Follow-ups due today"
          value={stats.followUpsDueToday}
          hint="Pending follow-ups due today"
        />
        <StatCard
          label="Follow-ups overdue"
          value={stats.followUpsOverdue}
          hint="Pending follow-ups past their due date"
        />
        <StatCard
          label="Upcoming meetings"
          value={stats.upcomingMeetingsCount}
          hint="Scheduled meetings from now on"
        />
        <StatCard
          label="Deals in pipeline"
          value={stats.dealsByStage.reduce((sum, row) => sum + row.count, 0)}
          hint="Across all deal stages"
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
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
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">
            Upcoming meetings
          </h2>
          {stats.upcomingMeetings.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">
              No upcoming meetings scheduled.
            </p>
          ) : (
            <ul className="mt-3 space-y-3">
              {stats.upcomingMeetings.map((m) => (
                <li key={m.id} className="text-sm">
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
        </section>
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:col-span-2">
          <h2 className="text-sm font-semibold text-slate-900">
            Recent activity
          </h2>
          {stats.recentActivity.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">
              No activity yet. Sign-ins and future module actions will appear
              here.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {stats.recentActivity.map((a) => (
                <li key={a.id} className="text-sm text-slate-600">
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
        </section>
      </div>
    </div>
  );
}
