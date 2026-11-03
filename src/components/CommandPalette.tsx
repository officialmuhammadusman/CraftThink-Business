"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Dialog, DialogContent } from "@/components/ui/dialog";

/** Cmd/Ctrl+K command palette that navigates to the main sections. */
export function CommandPalette({
  items,
}: {
  items: { label: string; href: string }[];
}) {
  const [open, setOpen] = React.useState(false);
  const router = useRouter();

  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-h-12 w-full items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-3 text-left text-base text-slate-500 hover:bg-slate-50 sm:w-72"
      >
        <span className="flex-1">Search sections…</span>
        <kbd className="pointer-events-none inline-flex h-6 select-none items-center gap-1 rounded border border-slate-200 bg-slate-50 px-1.5 text-sm font-medium text-slate-500">
          ⌘K
        </kbd>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="overflow-hidden p-0">
          <Command
            label="Navigate"
            filter={(value, search) =>
              value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
            }
          >
            <CommandInput placeholder="Go to a section…" />
            <CommandList>
              <CommandEmpty>No section found.</CommandEmpty>
              <CommandGroup heading="Sections">
                {items.map((item) => (
                  <CommandItem
                    key={item.href}
                    value={item.label}
                    onSelect={() => {
                      setOpen(false);
                      router.push(item.href);
                    }}
                  >
                    {item.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  );
}
