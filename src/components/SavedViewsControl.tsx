"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type SavedView = {
  id: string;
  module: string;
  name: string;
  filters: Record<string, string>;
};

/**
 * Small saved-views control for a list page. Save the current filter
 * set under a name, apply one in one tap, delete your own. Applying a
 * view only ever sets filter values — the list route still ANDs the
 * caller's PermissionGrant scope, so a view can never widen access.
 */
export default function SavedViewsControl({
  module,
  currentFilters,
  onApply,
}: {
  module: "companies" | "deals";
  currentFilters: Record<string, string>;
  onApply: (filters: Record<string, string>) => void;
}) {
  const [views, setViews] = useState<SavedView[]>([]);
  const [name, setName] = useState("");
  const [selected, setSelected] = useState("__none");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/saved-views?module=${module}`);
      const p = await r.json();
      if (r.ok) setViews(p.data?.items ?? []);
    } catch {
      // Saved views are a convenience; a failed load must not break the list.
    }
  }, [module]);

  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    if (!name.trim()) {
      toast.error("Give the view a name first.");
      return;
    }
    setSaving(true);
    try {
      const r = await fetch("/api/saved-views", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ module, name: name.trim(), filters: currentFilters }),
      });
      if (!r.ok) {
        const p = await r.json().catch(() => null);
        toast.error(p?.error ?? "Could not save view");
        return;
      }
      toast.success(`View "${name.trim()}" saved.`);
      setName("");
      load();
    } finally {
      setSaving(false);
    }
  }

  function apply(id: string) {
    setSelected(id);
    if (id === "__none") {
      onApply({});
      return;
    }
    const view = views.find((v) => v.id === id);
    if (view) onApply(view.filters);
  }

  async function remove(id: string) {
    const r = await fetch(`/api/saved-views/${id}`, { method: "DELETE" });
    if (!r.ok) {
      const p = await r.json().catch(() => null);
      toast.error(p?.error ?? "Could not delete view");
      return;
    }
    toast.success("View deleted.");
    if (selected === id) {
      setSelected("__none");
      onApply({});
    }
    load();
  }

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="min-w-52 flex-1 space-y-1">
        <label className="text-sm font-medium text-slate-700" htmlFor={`saved-view-${module}`}>
          Saved views
        </label>
        <Select value={selected} onValueChange={apply}>
          <SelectTrigger id={`saved-view-${module}`} className="min-h-12 text-base">
            <SelectValue placeholder="Choose a saved view…" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none">No saved view</SelectItem>
            {views.map((v) => (
              <SelectItem key={v.id} value={v.id}>
                {v.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {selected !== "__none" && (
        <Button
          type="button"
          variant="outline"
          className="min-h-12"
          onClick={() => remove(selected)}
        >
          Delete view
        </Button>
      )}
      <div className="flex flex-1 items-end gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name for current filters…"
          className="min-h-12 text-base"
          aria-label="Name for the current filter set"
        />
        <Button type="button" variant="outline" className="min-h-12 shrink-0" disabled={saving} onClick={save}>
          {saving ? "Saving…" : "Save view"}
        </Button>
      </div>
    </div>
  );
}
