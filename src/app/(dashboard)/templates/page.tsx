"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { api, ErrorAlert, TOKEN_HELP } from "../emails/ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import Pager from "@/components/Pager";

type Template = {
  id: string;
  name: string;
  industry: string | null;
  subject: string;
  body: string;
};

export default function TemplatesPage() {
  const [items, setItems] = useState<Template[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [industry, setIndustry] = useState("");
  const [applied, setApplied] = useState({ search: "", industry: "" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  function applySearch(e: FormEvent) {
    e.preventDefault();
    setPage(1);
    setApplied({ search: search.trim(), industry: industry.trim() });
    setFiltersOpen(false);
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: "20" });
    if (applied.search) params.set("search", applied.search);
    if (applied.industry) params.set("industry", applied.industry);
    api<{ items: Template[]; total: number; totalPages: number }>(
      `/api/templates?${params}`,
    )
      .then((data) => {
        if (cancelled) return;
        setItems(data.items);
        setTotal(data.total);
        setTotalPages(data.totalPages);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load templates");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [page, applied]);

  return (
    <div>
      <PageHeader
        title="Email templates"
        subtitle="Shared templates for industry outreach. Templates only prefill a recorded email — they never send anything."
        action={
          <Button asChild>
            <Link href="/templates/new">New template</Link>
          </Button>
        }
      />
      <Card className="mt-6">
        <CardContent className="p-4 text-base text-slate-600 sm:p-6">
          {TOKEN_HELP}
        </CardContent>
      </Card>
      <Card className="mt-4 hidden md:block">
        <CardContent className="p-4 sm:p-6">
          <form
            className="flex flex-col gap-2 sm:flex-row"
            onSubmit={applySearch}
          >
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search templates…" aria-label="Search templates" className="flex-1" />
            <Input value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="Industry filter" aria-label="Industry filter" />
            <Button type="submit">Search</Button>
          </form>
        </CardContent>
      </Card>
      <div className="mt-4 md:hidden">
        <Button type="button" variant="outline" className="w-full" onClick={() => setFiltersOpen(true)}>
          Filters{(applied.search || applied.industry) ? " (active)" : ""}
        </Button>
      </div>
      <ResponsiveDialog
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        title="Filters"
        description="Search templates and filter by industry."
      >
        <form className="space-y-4" onSubmit={applySearch}>
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search templates…" aria-label="Search templates" />
          <Input value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="Industry filter" aria-label="Industry filter" />
          <Button type="submit" className="w-full">Search</Button>
        </form>
      </ResponsiveDialog>
      <div className="mt-4">
        <ErrorAlert message={error} />
        {loading ? (
          <div className="space-y-3" aria-label="Loading templates">
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            image="/images/empty-templates.svg"
            title="No templates yet"
            description="Create the first one for an industry you target."
            action={
              <Button asChild>
                <Link href="/templates/new">New template</Link>
              </Button>
            }
          />
        ) : (
          <>
            <p className="text-base text-slate-500">{total} template(s)</p>
            <ul className="mt-3 space-y-3">
              {items.map((t) => (
                <li key={t.id}>
                  <Card>
                    <CardContent className="p-4 sm:p-6">
                      <Link href={`/templates/${t.id}`} className="inline-flex min-h-12 items-center text-base font-medium text-brand-600 hover:underline">
                        {t.name}
                      </Link>
                      <p className="mt-1 flex flex-wrap items-center gap-2 text-base text-slate-500">
                        <Badge variant="secondary">Industry: {t.industry ?? "Any"}</Badge>
                        <span>Subject: {t.subject}</span>
                      </p>
                      <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-base text-slate-600">{t.body}</p>
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
