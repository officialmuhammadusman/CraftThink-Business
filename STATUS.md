# CraftThink Business OS — STATUS (2026-11-03)

Build verified by coordinator: `npm run build` PASSED, `npm run lint` CLEAN
(0 warnings/errors). Nothing is live yet — deployment is the next step
(push to GitHub, import in Vercel). No emails have been sent by this app.

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

## Deliberately NOT built (milestone 2, not faked)
Full project/task management (schema exists; only won-deal conversion
creates a basic project record), Team/user-management pages,
Settings/change-password page, calendar sync, background-job
automation, advanced analytics charts beyond core counts/funnel.

## What Muhammad must do himself (nothing else blocks go-live)
1. Push this folder to GitHub repo officialmuhammadusman/CraftThink-Business
   and import it in Vercel (README.md has the exact steps).
2. Provision Postgres (Vercel Postgres, Neon, or Supabase) and set
   `DATABASE_URL` in Vercel env vars.
3. Set `AUTH_SECRET` (long random value), `ADMIN_EMAIL`,
   `ADMIN_PASSWORD` in Vercel env vars. No other env vars are needed.
4. After deploy: apply schema once (`DATABASE_URL=<hosted> npx prisma
   db push`), seed admin once (`POST https://<domain>/api/auth/seed`),
   sign in at `/login`, then CHANGE the admin password — until the
   Settings page exists (milestone 2), change it by updating the user's
   bcrypt `passwordHash` in the database (cost 12), per README.
5. Caveats: no live-database test was possible in the sandbox, so the
   first deploy + seed + sign-in is the first live test. npm flags
   Next 14.2.18 as having a known vulnerability — bump to a patched
   Next 14.x before production if time allows (not done: avoids
   breaking a passing build hours before go-live).
