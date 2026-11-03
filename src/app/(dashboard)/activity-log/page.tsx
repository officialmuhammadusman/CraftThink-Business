"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import Pager from "@/components/Pager";

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
  const [filtersOpen, setFiltersOpen] = useState(false);

  function applyEntityType(value: string) {
    setEntityType(value === "all" ? "" : value);
    setPage(1);
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "10" });
      if (entityType) params.set("entityType", entityType);
      const response = await fetch(`/api/activity-log?${params}`);
      if (!response.ok) throw new Error(await readError(response, "Failed to load activity log"));
      const payload = await response.json();
      setItems(payload.data.items as Entry[]);
      setTotalPages(payload.data.pagination.totalPages as number);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load activity log";
      setError(message);
      toast.error(message);
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
      <Card className="mt-6 hidden md:block">
        <CardContent className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 sm:p-6">
          <div className="space-y-2">
            <Label htmlFor="activity-entity">Entity type</Label>
            <Select value={entityType || "all"} onValueChange={applyEntityType}>
              <SelectTrigger id="activity-entity"><SelectValue placeholder="All types" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {ENTITY_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
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
      <div className="mt-6 md:hidden">
        <Button type="button" variant="outline" className="w-full" onClick={() => setFiltersOpen(true)}>
          Filters{entityType || actorSearch ? " (active)" : ""}
        </Button>
      </div>
      <ResponsiveDialog
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        title="Filters"
        description="Filter the activity log by entity type, actor or action."
        footer={
          <Button type="button" className="w-full" onClick={() => setFiltersOpen(false)}>
            Done
          </Button>
        }
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="activity-entity-sheet">Entity type</Label>
            <Select value={entityType || "all"} onValueChange={applyEntityType}>
              <SelectTrigger id="activity-entity-sheet"><SelectValue placeholder="All types" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {ENTITY_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="activity-search-sheet">Filter by actor or action</Label>
            <Input
              id="activity-search-sheet"
              value={actorSearch}
              onChange={(e) => setActorSearch(e.target.value)}
              placeholder="Filter by actor or action…"
            />
          </div>
        </div>
      </ResponsiveDialog>

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
            action={
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setEntityType("");
                  setActorSearch("");
                  setPage(1);
                }}
              >
                Clear filters
              </Button>
            }
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
