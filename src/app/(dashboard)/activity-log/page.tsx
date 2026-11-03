"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import Pager from "@/components/Pager";

const selectCls =
  "flex min-h-12 w-full rounded-md border border-slate-300 bg-white px-3 py-3 text-base text-slate-900";

type Entry = {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  details: Record<string, unknown> | null;
  createdAt: string;
  actor: { id: string; name: string; email: string } | null;
};

const ENTITY_TYPES = [
  "Company",
  "Contact",
  "Tag",
  "FollowUp",
  "Meeting",
  "Deal",
  "Project",
];

async function readError(response: Response, fallback: string): Promise<string> {
  const payload = await response.json().catch(() => null);
  return payload?.error ?? fallback;
}

export default function ActivityLogPage() {
  const [items, setItems] = useState<Entry[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [entityType, setEntityType] = useState("");
  const [actorSearch, setActorSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "30" });
      if (entityType) params.set("entityType", entityType);
      const response = await fetch(`/api/activity-log?${params}`);
      if (!response.ok) throw new Error(await readError(response, "Failed to load activity log"));
      const payload = await response.json();
      setItems(payload.data.items as Entry[]);
      setTotalPages(payload.data.pagination.totalPages as number);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load activity log");
    } finally {
      setLoading(false);
    }
  }, [page, entityType]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = actorSearch
    ? items.filter((e) =>
        (e.actor?.name ?? "System").toLowerCase().includes(actorSearch.toLowerCase()) ||
        e.action.toLowerCase().includes(actorSearch.toLowerCase()),
      )
    : items;

  return (
    <div>
      <PageHeader
        title="Activity log"
        subtitle="Newest first. Admins see everything; other roles see only their own actions. Every create, update, delete and stage change is recorded here."
      />
      <Card className="mt-6">
        <CardContent className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 sm:p-6">
          <div className="space-y-2">
            <Label htmlFor="activity-entity">Entity type</Label>
            <select
              id="activity-entity"
              value={entityType}
              onChange={(e) => {
                setEntityType(e.target.value);
                setPage(1);
              }}
              className={selectCls}
            >
              <option value="">All types</option>
              {ENTITY_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="activity-search">Filter by actor or action</Label>
            <Input
              id="activity-search"
              value={actorSearch}
              onChange={(e) => setActorSearch(e.target.value)}
              placeholder="Filter by actor or action…"
            />
          </div>
        </CardContent>
      </Card>

      {error && (
        <p role="alert" className="mt-4 rounded-md bg-red-50 px-3 py-3 text-base text-red-700">{error}</p>
      )}
      {loading ? (
        <div className="mt-4 space-y-3" aria-label="Loading activity">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            image="/images/empty-activity.svg"
            title="No activity matches these filters"
            description="Try a different entity type or search term."
          />
        </div>
      ) : (
        <>
          <ul className="mt-4 space-y-3">
            {filtered.map((entry) => (
              <li key={entry.id}>
                <Card>
                  <CardContent className="p-4 sm:p-6">
                    <p className="flex flex-wrap items-center gap-2 text-base">
                      <span className="font-medium text-slate-900">
                        {entry.actor?.name ?? "System"}
                      </span>
                      <Badge variant="secondary">{entry.entityType}</Badge>
                      <span className="text-slate-600">
                        {entry.action.replaceAll("_", " ").toLowerCase()}
                      </span>
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      {new Date(entry.createdAt).toLocaleString()}
                      {entry.details?.title ? ` · ${String(entry.details.title)}` : ""}
                      {entry.details?.name ? ` · ${String(entry.details.name)}` : ""}
                      {entry.details?.stageTo ? ` · ${String(entry.details.stageFrom ?? "")} → ${String(entry.details.stageTo)}` : ""}
                    </p>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
          <Pager page={page} totalPages={totalPages} onPage={setPage} />
        </>
      )}
    </div>
  );
}
