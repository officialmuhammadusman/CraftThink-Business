"use client";

import Link from "next/link";
import { useState } from "react";
import { Menu } from "lucide-react";
import LogoutButton from "@/components/LogoutButton";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

export type NavItem = { label: string; href: string };

export default function MobileNav({
  items,
  userName,
  userEmail,
  userRole,
}: {
  items: NavItem[];
  userName: string;
  userEmail: string;
  userRole: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
      <p className="text-base font-semibold text-slate-900">
        CraftThink <span className="text-brand-600">Business OS</span>
      </p>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Open navigation menu"
          >
            <Menu />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="flex flex-col overflow-y-auto px-4">
          <SheetHeader>
            <SheetTitle>
              CraftThink <span className="text-brand-600">Business OS</span>
            </SheetTitle>
          </SheetHeader>
          <nav className="mt-4 flex flex-col gap-1" aria-label="Main">
            {items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="flex min-h-12 items-center rounded-md px-3 py-3 text-base font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="mt-auto border-t border-slate-200 pt-4 pb-[env(safe-area-inset-bottom)]">
            <p className="truncate text-base font-medium text-slate-900">
              {userName}
            </p>
            <p className="truncate text-base text-slate-500">{userEmail}</p>
            <p className="mt-1 text-sm font-medium uppercase tracking-wide text-slate-400">
              {userRole.replaceAll("_", " ")}
            </p>
            <div className="mt-3 flex min-h-12 w-full items-center">
              <LogoutButton />
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

// Re-export trigger type helper kept for clarity in the layout file.
export type { NavItem as MobileNavItem };
