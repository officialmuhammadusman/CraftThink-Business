import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getSessionUser } from "@/lib/auth";
import { DashboardShell } from "@/components/DashboardShell";

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
  { label: "Quotes", href: "/deals/quotes" },
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
    <DashboardShell
      navItems={navItems}
      userName={user.name}
      userEmail={user.email}
      userRole={user.role}
    >
      {children}
    </DashboardShell>
  );
}
