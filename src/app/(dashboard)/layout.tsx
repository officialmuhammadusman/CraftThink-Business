import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getSessionUser } from "@/lib/auth";
import LogoutButton from "@/components/LogoutButton";
import MobileNav from "@/components/MobileNav";

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

// Team is shown only to SUPER_ADMIN (not to ADMIN), per the UI spec.
// This is a display rule only; API permission checks are untouched.
const SUPER_ADMIN_NAV = [{ label: "Team", href: "/team" }];
const USER_NAV = [{ label: "Settings", href: "/settings" }];

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const navItems = [
    ...NAV,
    ...(user.role === "SUPER_ADMIN" ? SUPER_ADMIN_NAV : []),
    ...USER_NAV,
  ];

  return (
    <div className="min-h-screen lg:flex">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-slate-200 bg-white lg:flex">
        <div className="px-4 py-4">
          <p className="text-base font-semibold text-slate-900">
            CraftThink <span className="text-brand-600">Business OS</span>
          </p>
        </div>
        <nav
          className="flex flex-col gap-1 overflow-y-auto px-3"
          aria-label="Main"
        >
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex min-h-12 items-center rounded-md px-3 py-3 text-base font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto border-t border-slate-200 p-4">
          <p className="truncate text-base font-medium text-slate-900">
            {user.name}
          </p>
          <p className="truncate text-base text-slate-500">{user.email}</p>
          <p className="mt-1 text-sm font-medium uppercase tracking-wide text-slate-400">
            {user.role.replaceAll("_", " ")}
          </p>
          <div className="mt-3 flex min-h-12 w-full items-center">
            <LogoutButton />
          </div>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <MobileNav
          items={navItems}
          userName={user.name}
          userEmail={user.email}
          userRole={user.role}
        />
        <main className="px-4 py-6 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
