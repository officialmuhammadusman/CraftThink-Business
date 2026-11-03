"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, ErrorAlert } from "../emails/ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import Pager from "@/components/Pager";

type Campaign = {
  id: string;
  name: string;
  description: string | null;
  owner: { id: string; name: string; email: string } | null;
  _count: { emailActivities: number };
  createdAt: string;
};

export default function CampaignsPage() {
  const [items, setItems] = useState<Campaign[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: "20" });
    if (appliedSearch) params.set("search", appliedSearch);
    api<{ items: Campaign[]; total: number; totalPages: number }>(
      `/api/campaigns?${params}`,
    )
      .then((data) => {
        if (cancelled) return;
        setItems(data.items);
        setTotal(data.total);
        setTotalPages(data.totalPages);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load campaigns");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [page, appliedSearch]);

  return (
    <div>
      <PageHeader
        title="Campaigns"
        subtitle="Tracking groups for outreach. Campaigns here organise recorded emails — they do not send anything."
        action={
          <Button asChild>
            <Link href="/campaigns/new">New campaign</Link>
          </Button>
        }
      />
      <Card className="mt-6">
        <CardContent className="p-4 sm:p-6">
          <form
            className="flex flex-col gap-2 sm:flex-row"
            onSubmit={(e) => {
              e.preventDefault();
              setPage(1);
              setAppliedSearch(search.trim());
            }}
          >
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search campaigns…"
              aria-label="Search campaigns"
              className="flex-1"
            />
            <Button type="submit">Search</Button>
          </form>
        </CardContent>
      </Card>
      <div className="mt-4">
        <ErrorAlert message={error} />
        {loading ? (
          <div className="space-y-3" aria-label="Loading campaigns">
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            image="/images/empty-campaigns.svg"
            title="No campaigns yet"
            description="Create the first one to group tracked emails."
            action={
              <Button asChild>
                <Link href="/campaigns/new">New campaign</Link>
              </Button>
            }
          />
        ) : (
          <>
            <p className="text-base text-slate-500">{total} campaign(s)</p>
            <ul className="mt-3 space-y-3">
              {items.map((c) => (
                <li key={c.id}>
                  <Card>
                    <CardContent className="p-4 sm:p-6">
                      <Link
                        href={`/campaigns/${c.id}`}
                        className="inline-flex min-h-12 items-center text-base font-medium text-brand-600 hover:underline"
                      >
                        {c.name}
                      </Link>
                      {c.description ? (
                        <p className="mt-1 text-base text-slate-600">{c.description}</p>
                      ) : null}
                      <p className="mt-2 flex flex-wrap items-center gap-2 text-base text-slate-500">
                        <span>Owner: {c.owner?.name ?? "Unassigned"}</span>
                        <Badge variant="secondary">
                          {c._count.emailActivities} tracked email(s)
                        </Badge>
                        <span>Created {new Date(c.createdAt).toLocaleDateString()}</span>
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
    </div>
  );
}
