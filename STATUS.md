# CraftThink Business OS — STATUS (2026-11-03, updated milestone 2)

Build verified by coordinator: `npm run build` PASSED, `npm run lint` CLEAN
(0 warnings/errors). Milestone-2 code below is built and verified
locally only — it is NOT pushed or deployed yet; deployment is the
parent's step. No emails have been sent by this app.

## Milestone 2 — DONE (Projects, Tasks, Team, Settings)
Build re-verified by milestone-2 builder: `npm run build` PASSED,
`npm run lint` CLEAN. New schema fields applied by `prisma db push` on
deploy (vercel.json build command): Project.requirements,
Project.internalNotes, Project.developers (many-to-many to User),
Task.startDate, and a new TaskComment model (task, author, body).
- Projects: list + detail pages, full CRUD API + UI (name, client
  company, description, budget, start/end dates, manager, assigned
  developers, status, tech stack, requirements, internal notes). WON
  deals still convert only behind the explicit confirmation on the
  Deals page; converted projects are then editable on their detail page.
- Tasks: CRUD per project + a global Tasks list; title, description,
  assignee, priority, start date, deadline, status, progress (0–100),
  comments/notes per task. Server-side scoping: developers/designers
  see only projects they are assigned to (developer link or task) and
  only their tasks; a task assignee may update only their own
  status/progress, full edits need admin/PM-manager/project-developer.
- Team (Super Admin + Admin only, sidebar link hidden for others):
  list, create with role, deactivate/reactivate, change roles.
  passwordHash is never selected or returned; you cannot deactivate
  your own account or remove the last active Super Admin.
- Settings: any signed-in user changes their own password after
  verifying the current one (bcrypt cost 12, min 8 chars), via
  POST /api/auth/change-password. This closes the milestone-1 gap where
  the admin password could only be changed directly in the database.
- Sidebar now links Projects, Tasks, Team (admins only), Settings;
  every sidebar link points to a real page. All new writes audit-logged;
  no sending code, Gmail OAuth, or background jobs were added.

## Stack decision (final)
Vercel-native only: Next.js 14 App Router + TypeScript + Tailwind +
Prisma + PostgreSQL via `DATABASE_URL`, Zod, bcryptjs, jose cookie
sessions. NO separate NestJS backend (one deploy, team already ships
Next.js on Vercel, API routes cover this workload). Justification in
docs/prd.md §8 and docs/architecture.md.

## What works end-to-end (real, from the database, no hardcoded stats)
- Auth + RBAC: credentials login, secure cookie session, 6 roles
  (Super Admin, Admin, Project Manager, Sales Executive, Developer,
  Designer), server-side permission checks + assigned-data-only scoping
  on every API route, audit log on every write.
- Dashboard headline = COVERAGE: discovered vs contacted vs
  not-yet-contacted, grouped by country → city → industry; per-business
  timeline (contacted date, emails sent, reply status, follow-up due);
  filters contacted / not contacted / replied / interested + country +
  industry. Plus real stat cards (leads, emails, responses, follow-ups
  due/overdue, meetings, deals by stage, active projects).
- Companies/contacts: CRUD, duplicate prevention (409 with existing
  record), search/filter, tags, assignment, CSV import + export,
  company detail page with email timeline, follow-ups, meetings, deals.
- Campaigns + industry templates ({{company}} {{contactName}}
  {{senderName}} tokens) + email-activity TRACKING: fast manual entry,
  CSV import of sent-email records (suppression + duplicate skipping),
  status updates (replied/positive/negative/follow-up-required/
  unsubscribed/bounced/delivered), suppression list, follow-up reminders
  from records, follow-ups-due filter.
- Follow-ups (today/overdue/upcoming), meetings (5 statuses),
  10-stage deal pipeline (New Lead → … → Won/Lost) with won→project
  conversion behind an explicit confirmation step only.
- Sidebar covers exactly the pages that exist: Dashboard, Companies,
  Campaigns, Templates, Emails, Suppression, Follow-ups, Meetings,
  Deals, Activity Log.

## TRACKING ONLY — no sending in this build
No Gmail OAuth, no send endpoint, no email-sending code anywhere
(verified by grep). Cold emails are sent separately through Gmail;
this app records and tracks them. Suppression/unsubscribe are
tracking/compliance records. Future Gmail integration is a later phase.

## Deliberately NOT built (later milestones, not faked)
Calendar sync, background-job automation, advanced analytics charts
beyond core counts/funnel, and password-reset (forgot-password email
flow — deliberately absent, since this app sends no email).

## What Muhammad must do himself (nothing else blocks go-live)
1. Push this folder to GitHub repo officialmuhammadusman/CraftThink-Business
   and import it in Vercel (README.md has the exact steps).
2. Provision Postgres (Vercel Postgres, Neon, or Supabase) and set
   `DATABASE_URL` in Vercel env vars.
3. Set `AUTH_SECRET` (long random value), `ADMIN_EMAIL`,
   `ADMIN_PASSWORD` in Vercel env vars. No other env vars are needed.
4. After deploy: apply schema once (`DATABASE_URL=<hosted> npx prisma
   db push`), seed admin once (`POST https://<domain>/api/auth/seed`),
   sign in at `/login`, then CHANGE the admin password in
   Settings → Change your password (no longer a database edit).
5. Caveats: no live-database test was possible in the sandbox, so the
   first deploy + seed + sign-in is the first live test. npm flags
   Next 14.2.18 as having a known vulnerability — bump to a patched
   Next 14.x before production if time allows (not done: avoids
   breaking a passing build hours before go-live).
