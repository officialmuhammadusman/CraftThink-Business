import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getSessionUser } from "@/lib/auth";
import LogoutButton from "@/components/LogoutButton";

export const dynamic = "force-dynamic";

const NAV = [
  { label: "Dashboard", href: "/" },
  { label: "Companies", href: "/companies" },
  { label: "Campaigns", href: "/campaigns" },
  { label: "Templates", href: "/templates" },
  { label: "Emails", href: "/emails" },
  { label: "Suppression", href: "/suppression" },
  { label: "Follow-ups", href: "/follow-ups" },
  { label: "Meetings", href: "/meetings" },
  { label: "Deals", href: "/deals" },
  { label: "Projects", href: "/projects" },
  { label: "Tasks", href: "/tasks" },
  { label: "Activity Log", href: "/activity-log" },
];

const ADMIN_NAV = [{ label: "Team", href: "/team" }];
const USER_NAV = [{ label: "Settings", href: "/settings" }];

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const isAdmin = user.role === "SUPER_ADMIN" || user.role === "ADMIN";
  const navItems = [
    ...NAV,
    ...(isAdmin ? ADMIN_NAV : []),
    ...USER_NAV,
  ];

  return (
    <div className="min-h-screen lg:flex">
      <aside className="border-b border-slate-200 bg-white lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-60 lg:shrink-0 lg:flex-col lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between px-4 py-4 lg:block">
          <p className="text-base font-semibold text-slate-900">
            CraftThink <span className="text-brand-600">Business OS</span>
          </p>
          <div className="lg:hidden">
            <LogoutButton />
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-4 pb-3 lg:flex-col lg:overflow-visible lg:px-3 lg:pb-0">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto hidden border-t border-slate-200 p-4 lg:block">
          <p className="truncate text-sm font-medium text-slate-900">
            {user.name}
          </p>
          <p className="truncate text-xs text-slate-500">{user.email}</p>
          <p className="mt-1 text-xs font-medium uppercase tracking-wide text-slate-400">
            {user.role.replaceAll("_", " ")}
          </p>
          <div className="mt-3">
            <LogoutButton />
          </div>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 sm:px-6 lg:hidden">
          <div>
            <p className="truncate text-sm font-medium text-slate-900">
              {user.name}
            </p>
            <p className="text-xs text-slate-500">
              {user.role.replaceAll("_", " ")}
            </p>
          </div>
        </header>
        <main className="px-4 py-6 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
