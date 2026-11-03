"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity,
  Bell,
  Briefcase,
  Building2,
  CalendarDays,
  ChevronRight,
  Clock,
  FileText,
  Folder,
  LayoutDashboard,
  ListChecks,
  Mail,
  Megaphone,
  PanelLeft,
  Plus,
  Settings,
  ShieldOff,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CommandPalette } from "@/components/CommandPalette";
import LogoutButton from "@/components/LogoutButton";
import MobileNav from "@/components/MobileNav";
import { Toaster } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";

export type NavItem = { label: string; href: string };

const ICONS: Record<string, LucideIcon> = {
  "/": LayoutDashboard,
  "/companies": Building2,
  "/campaigns": Megaphone,
  "/templates": FileText,
  "/emails": Mail,
  "/suppression": ShieldOff,
  "/follow-ups": Clock,
  "/meetings": CalendarDays,
  "/deals": Briefcase,
  "/projects": Folder,
  "/tasks": ListChecks,
  "/activity-log": Activity,
  "/team": Users,
  "/settings": Settings,
};

const BOTTOM_TABS: NavItem[] = [
  { label: "Dashboard", href: "/" },
  { label: "Companies", href: "/companies" },
  { label: "Emails", href: "/emails" },
  { label: "Deals", href: "/deals" },
];

const CREATE_LINKS: NavItem[] = [
  { label: "Company", href: "/companies" },
  { label: "Campaign", href: "/campaigns/new" },
  { label: "Email record", href: "/emails/new" },
  { label: "Template", href: "/templates/new" },
  { label: "Deal", href: "/deals" },
];

function NotificationsMenu() {
  const [open, setOpen] = React.useState(false);
  const [data, setData] = React.useState<{
    followUpsDueToday: number;
    followUpsOverdue: number;
    upcomingMeetings: { id: string; title: string; dateTime: string }[];
  } | null>(null);
  const router = useRouter();

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetch("/api/dashboard/stats")
      .then((r) => (r.ok ? r.json() : null))
      .then((payload) => {
        if (!cancelled && payload?.data) {
          setData({
            followUpsDueToday: payload.data.followUpsDueToday ?? 0,
            followUpsOverdue: payload.data.followUpsOverdue ?? 0,
            upcomingMeetings: payload.data.upcomingMeetings ?? [],
          });
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open ]);

  const count =
    (data?.followUpsDueToday ?? 0) + (data?.followUpsOverdue ?? 0);
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Notifications"
          className="relative"
        >
          <Bell />
          {count > 0 ? (
            <span className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-red-600 text-xs font-semibold text-white">
              {count > 9 ? "9+" : count}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel>Notifications</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {!data ? (
          <p className="px-2 py-3 text-sm text-slate-500">
            Open to load follow-ups and meetings.
          </p>
        ) : (
          <>
            <DropdownMenuItem
              onClick={() => router.push("/follow-ups")}
              className="flex-col items-start gap-0"
            >
              <span className="font-medium">Follow-ups</span>
              <span className="text-sm text-slate-500">
                {data.followUpsDueToday} due today · {data.followUpsOverdue}{" "}
                overdue
              </span>
            </DropdownMenuItem>
            {data.upcomingMeetings.length === 0 ? (
              <p className="px-2 py-3 text-sm text-slate-500">
                No upcoming meetings.
              </p>
            ) : (
              data.upcomingMeetings.map((m) => (
                <DropdownMenuItem
                  key={m.id}
                  onClick={() => router.push("/meetings")}
                  className="flex-col items-start gap-0"
                >
                  <span className="font-medium">{m.title}</span>
                  <span className="text-sm text-slate-500">
                    {new Date(m.dateTime).toLocaleString()}
                  </span>
                </DropdownMenuItem>
              ))
            )}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function UserMenu({
  userName,
  userEmail,
  userRole,
}: {
  userName: string;
  userEmail: string;
  userRole: string;
}) {
  const router = useRouter();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="min-h-12 max-w-56 justify-start gap-2"
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-semibold text-white">
            {userName.charAt(0).toUpperCase()}
          </span>
          <span className="hidden truncate text-left md:block">
            <span className="block truncate text-sm font-medium">
              {userName}
            </span>
            <span className="block truncate text-xs text-slate-500">
              {userRole.replaceAll("_", " ")}
            </span>
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="flex flex-col gap-0">
          <span>{userName}</span>
          <span className="truncate text-sm font-normal text-slate-500">
            {userEmail}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => router.push("/settings")}>
          <Settings /> Settings
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <div className="p-1">
          <LogoutButton />
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Professional app shell: collapsible sidebar (240px, 72px rail when
 * collapsed) + h-16 header with trigger, breadcrumb, Cmd+K search,
 * notifications, and user menu. Mobile: top drawer trigger, bottom tabs for
 * the top destinations, and a floating +Create action.
 */
export function DashboardShell({
  navItems,
  userName,
  userEmail,
  userRole,
  children,
}: {
  navItems: NavItem[];
  userName: string;
  userEmail: string;
  userRole: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = React.useState(false);

  React.useEffect(() => {
    try {
      setCollapsed(localStorage.getItem("ct-sidebar-collapsed") === "1");
    } catch {
      // Private mode etc. — sidebar just stays expanded.
    }
  }, []);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      try {
        localStorage.setItem("ct-sidebar-collapsed", prev ? "0" : "1");
      } catch {
        // Ignore storage failures.
      }
      return !prev;
    });
  }

  const crumbs = React.useMemo(() => {
    const parts = pathname.split("/").filter(Boolean);
    const items: NavItem[] = [{ label: "Dashboard", href: "/" }];
    let acc = "";
    for (const part of parts) {
      acc += `/${part}`;
      const match = navItems.find((n) => n.href === acc);
      items.push({
        label: match ? match.label : part.replaceAll("-", " "),
        href: acc,
      });
    }
    return items;
  }, [pathname, navItems]);

  return (
    <div className="min-h-screen bg-slate-50 lg:flex">
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "sticky top-0 hidden h-screen shrink-0 flex-col border-r border-slate-200 bg-white transition-all lg:flex",
          collapsed ? "w-[72px]" : "w-60",
        )}
      >
        <div className="flex h-16 items-center gap-2 border-b border-slate-200 px-4">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-brand-600 text-sm font-bold text-white">
            C
          </span>
          {!collapsed ? (
            <p className="truncate text-sm font-semibold text-slate-900">
              CraftThink <span className="text-brand-600">Business OS</span>
            </p>
          ) : null}
        </div>
        <nav
          className="flex flex-col gap-1 overflow-y-auto px-3 py-3"
          aria-label="Main"
        >
          {navItems.map((item) => {
            const Icon = ICONS[item.href] ?? Folder;
            const active =
              pathname === item.href ||
              (item.href !== "/" && pathname.startsWith(item.href + "/"));
            return (
              <Link
                key={item.href}
                href={item.href}
                title={collapsed ? item.label : undefined}
                className={cn(
                  "flex min-h-12 items-center gap-3 rounded-md px-3 py-3 text-sm font-medium",
                  active
                    ? "bg-indigo-50 text-brand-700"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                  collapsed && "justify-center px-0",
                )}
              >
                <Icon className="size-5 shrink-0" />
                {!collapsed ? <span>{item.label}</span> : null}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto border-t border-slate-200 p-4">
          {!collapsed ? (
            <>
              <p className="truncate text-sm font-medium text-slate-900">
                {userName}
              </p>
              <p className="truncate text-sm text-slate-500">{userEmail}</p>
              <p className="mt-1 text-xs font-medium uppercase tracking-wide text-slate-400">
                {userRole.replaceAll("_", " ")}
              </p>
            </>
          ) : null}
          <div className="mt-3 flex min-h-12 w-full items-center">
            <LogoutButton />
          </div>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        {/* Mobile top bar with drawer */}
        <MobileNav
          items={navItems}
          userName={userName}
          userEmail={userEmail}
          userRole={userRole}
        />
        {/* Desktop h-16 header */}
        <header className="sticky top-0 z-30 hidden h-16 items-center gap-4 border-b border-slate-200 bg-white px-4 sm:px-6 lg:flex">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <PanelLeft />
          </Button>
          <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1 text-sm text-slate-500">
            {crumbs.map((c, i) => (
              <span key={c.href} className="flex items-center gap-1">
                {i > 0 ? <ChevronRight className="size-4" /> : null}
                <Link
                  href={c.href}
                  className={cn(
                    "truncate hover:text-slate-900",
                    i === crumbs.length - 1 &&
                      "font-medium text-slate-900",
                  )}
                >
                  {c.label}
                </Link>
              </span>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <div className="w-72">
              <CommandPalette items={navItems} />
            </div>
            <NotificationsMenu />
            <UserMenu
              userName={userName}
              userEmail={userEmail}
              userRole={userRole}
            />
          </div>
        </header>
        {/* Mobile search row (Cmd+K palette trigger) */}
        <div className="border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
          <CommandPalette items={navItems} />
        </div>
        <main className="px-4 py-6 pb-28 sm:px-6 lg:pb-6">{children}</main>
        <Toaster />
      </div>

      {/* Mobile bottom tabs + floating +Create */}
      <nav
        aria-label="Quick navigation"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        <div className="relative grid grid-cols-5">
          {BOTTOM_TABS.slice(0, 2).map((item) => {
            const Icon = ICONS[item.href] ?? Folder;
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex min-h-16 flex-col items-center justify-center gap-1 text-xs font-medium",
                  active ? "text-brand-700" : "text-slate-500",
                )}
              >
                <Icon className="size-6" />
                {item.label}
              </Link>
            );
          })}
          <div className="relative flex items-start justify-center">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  aria-label="Create new"
                  className="absolute -top-6 size-14 rounded-full bg-brand-600 text-white shadow-lg hover:bg-brand-700"
                >
                  <Plus className="size-7" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center" side="top" className="w-56">
                <DropdownMenuLabel>Create new</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {CREATE_LINKS.map((item) => (
                  <DropdownMenuItem key={item.href + item.label} asChild>
                    <Link href={item.href}>{item.label}</Link>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          {BOTTOM_TABS.slice(2).map((item) => {
            const Icon = ICONS[item.href] ?? Folder;
            const active =
              pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex min-h-16 flex-col items-center justify-center gap-1 text-xs font-medium",
                  active ? "text-brand-700" : "text-slate-500",
                )}
              >
                <Icon className="size-6" />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
