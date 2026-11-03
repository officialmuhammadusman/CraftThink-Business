"use client";

import * as React from "react";
import { format } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { DateRange } from "react-day-picker";

export function toISODate(d: Date | undefined): string {
  if (!d) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function fromISODate(s: string | undefined): Date | undefined {
  if (!s) return undefined;
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d);
}

/** shadcn-style single date picker (Calendar inside a Popover). Value is a yyyy-mm-dd string. */
export function DatePicker({
  value,
  onChange,
  placeholder = "Pick a date",
  disabled,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const selected = fromISODate(value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn(
            "w-full justify-start text-left font-normal",
            !selected && "text-slate-400",
            className,
          )}
        >
          <CalendarIcon className="mr-2 size-5" />
          {selected ? format(selected, "PPP") : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={(d) => {
            onChange(toISODate(d));
            setOpen(false);
          }}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}

/** shadcn-style date-range picker. Value is { from, to } as yyyy-mm-dd strings. */
export function DateRangePicker({
  value,
  onChange,
  className,
}: {
  value: { from: string; to: string };
  onChange: (value: { from: string; to: string }) => void;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const range: DateRange | undefined =
    value.from || value.to
      ? { from: fromISODate(value.from), to: fromISODate(value.to) }
      : undefined;
  const label =
    value.from && value.to
      ? `${value.from} → ${value.to}`
      : value.from
        ? `From ${value.from}`
        : "Pick a date range";
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn("justify-start text-left font-normal", className)}
        >
          <CalendarIcon className="mr-2 size-5" />
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="range"
          selected={range}
          onSelect={(r) =>
            onChange({
              from: toISODate(r?.from),
              to: toISODate(r?.to),
            })
          }
          numberOfMonths={2}
          initialFocus
        />
        <div className="flex justify-end gap-2 border-t border-slate-200 p-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onChange({ from: "", to: "" })}
          >
            Clear
          </Button>
          <Button type="button" size="sm" onClick={() => setOpen(false)}>
            Done
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
