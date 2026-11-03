# CraftThink Business OS

Internal business operating system for CraftThink: companies, contacts,
campaigns, emails, follow-ups, meetings, deals, projects, tasks, and an
audit log — in one Next.js app. No separate backend, no paid services.

## Stack (fixed)

- Next.js App Router (TypeScript) + Tailwind CSS
- Prisma ORM with PostgreSQL via `DATABASE_URL`
- Zod validation, bcryptjs password hashing
- Signed cookie sessions (jose JWT in an httpOnly, secure cookie)
- No third-party auth service, no Redis, no email-sending code in this pass

## Local setup

```bash
npm install
cp .env.example .env
# Edit .env: set DATABASE_URL, AUTH_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD
npx prisma migrate dev
# Or, without migrations (e.g. a hosted DB you cannot migrate from here):
# npx prisma db push
npm run dev
```

### Seed the first admin

With the server running (or via curl against the deployed URL), call:

```bash
curl -X POST http://localhost:3000/api/auth/seed
```

This succeeds **only** when no users exist yet **and** `ADMIN_EMAIL` /
`ADMIN_PASSWORD` are set. It creates one `SUPER_ADMIN`. Afterwards, sign in
at `/login` with those credentials.

> **SECURITY — change the admin password after first login.** The
> `ADMIN_PASSWORD` value is a first-run bootstrap only. Change it in
> the app after signing in: Settings → Change your password
> (POST /api/auth/change-password, current password verified, bcrypt
> cost 12). Never commit a real password to the repo or to `.env.example`.

### Dev-only demo seed (optional)

```bash
SEED_DEV=true npm run seed:dev
```

Creates only clearly fake records (`Demo Company (dev only)`). The script
refuses to run unless `SEED_DEV=true`. Never run it against production.

## Vercel deployment

1. Push this folder to a Git repository and import it in Vercel.
2. Provision Postgres (Vercel Postgres, Neon, or Supabase) and add
   `DATABASE_URL` in Vercel → Project → Settings → Environment Variables.
3. Add `AUTH_SECRET` (long random value, e.g. `openssl rand -hex 32`),
   `ADMIN_EMAIL`, and `ADMIN_PASSWORD`. No other env vars are needed —
   there are no Google OAuth vars: this app is tracking-only (see below).
4. Deploy. The build runs `prisma generate` automatically.
5. Apply the schema to the hosted database once, from your machine:
   `DATABASE_URL=<hosted-url> npx prisma db push`
   (or `prisma migrate deploy` if migrations exist).
6. Seed the admin once: `curl -X POST https://<your-domain>/api/auth/seed`
7. Sign in at `https://<your-domain>/login` and change the admin password
   (see SECURITY note above).

## What exists in this scaffold

- `prisma/schema.prisma` — full schema for all future modules (User,
  Company, Contact, Tag, Campaign, EmailTemplate, EmailActivity, FollowUp,
  Meeting, Deal, Project, Task, ActivityLog, Suppression). See the comment
  at the top of that file about the duplicate-company rule: the database
  constraint `@@unique([name, website])` does not block two same-name
  companies with no website (PostgreSQL treats NULL as distinct), so
  module builders must also check duplicates in code.
- `src/lib/` — `prisma.ts` (singleton), `auth.ts` (hash/verify, JWT
  session, `getSessionUser`), `rbac.ts` (PermissionGrant model, `MODULES`,
  `getPermission`, `requirePermission`, `moduleAccess`, plus legacy `can`,
  `requireAuth`, `requireRole`), `validation.ts` (Zod schemas),
  `audit.ts` (`writeAudit`), `api.ts` (JSON/error helpers).
- API routes — `api/auth/login`, `api/auth/logout`, `api/auth/me`,
  `api/auth/seed`, `api/dashboard/stats` (real DB counts, zero when empty),
  `api/dashboard/coverage` (coverage totals, country/city/industry groups,
  and per-business timeline data — all from the database).
- Pages — `/login` (real sign-in with error handling), `/` dashboard (see
  Coverage below), plus full pages for Companies, Campaigns, Templates,
  Emails (+ import/new), Suppression, Follow-ups, Meetings, Deals,
  Projects (+ detail), Tasks, Activity Log, Team (Super Admin only) and
  Settings (change own password).
- **Milestone 2 (built): Projects, Tasks, Team, Settings.** Projects:
  full CRUD with client company, budget, dates, manager, assigned
  developers, status, tech stack, requirements and internal notes; a WON
  deal converts into a project from the Deals page (explicit
  confirmation) and the project can then be edited on its detail page.
  Tasks: CRUD per project plus a global Tasks list; status, priority,
  start date, deadline, progress (0–100) and comments/notes per task.
  Scoping is server-side: developers/designers see only projects they
  are assigned to (as a developer or through a task) and only their own
  tasks; task assignees may update only their own status/progress.
  Team (Super Admin only): list users, create with job title only,
  deactivate/reactivate, change job titles, and grant per-module
  permissions (see Permissions below) — password hashes are never
  returned by any API, and the last active Super Admin cannot be removed
  (nor can you deactivate your own account). Settings: any signed-in
  user changes their own password after verifying the current one
  (bcrypt cost 12). Sidebar links to Projects, Tasks, Team (Super Admin
  only) and Settings; every sidebar link now points to a real page.
  totals discovered/contacted/not-yet-contacted/replied/interested, a
  table grouped by country, then city, then industry, and a per-business
  list with contacted date (first email record), emails sent, reply
  status, and next follow-up due date; each business expands to show its
  email timeline and follow-ups. Contacted = has at least one
  EmailActivity record; no email record = not-yet-contacted; Replied =
  a REPLIED/POSITIVE/NEGATIVE status; Interested = a POSITIVE reply.
  Filters: contacted / not contacted / replied / interested, plus country
  and industry. Below Coverage are real stat cards from
  `/api/dashboard/stats`, empty states, and recent activity. Sidebar
  links to Companies, Campaigns, Emails, Follow-ups, Meetings, Deals,
  Projects, Tasks, Team, and Settings all point to real pages (see
  Milestone 2 above).
- Guards — `src/middleware.ts` redirects unauthenticated dashboard-page
  visits to `/login`; every API route returns 401 when unauthenticated.

## What is deliberately NOT in this pass

- **TRACKING ONLY — no Gmail sending, no Gmail OAuth.** Cold emails are
  sent separately by the assistant through Gmail; this app only records
  and tracks them. There is no email-sending code, no OAuth flow, and no
  Google env vars anywhere in this app. `EmailActivity` stores the
  tracked record (company, contact, recipient, sender account, subject,
  body, date/time, campaign, sequence number, status, follow-up date,
  assigned employee). `Suppression` (email + reason) is a
  tracking/compliance record only, not a sending engine. A later module
  will build the tracking-only email-activity UI (fast manual entry form,
  CSV import of sent-email records, reply/status updates, follow-up
  reminders from those records).
- No password-change / password-reset flow yet (see SECURITY note) —
  superseded for change-password by milestone 2 (Settings page +
  POST /api/auth/change-password). Password RESET (forgot-password
  email flow) is still not built, deliberately: this app sends no email.
- No module list/detail pages beyond the dashboard (Companies, Campaigns,
  Emails, Follow-ups, Meetings, Deals, Projects, Team, Settings).
- No scheduled jobs, no follow-up overdue auto-flip job (the dashboard
  computes overdue from `dueDate`, so stale stored status never hides it).
- No fake production data and no hardcoded stats anywhere.

## Permissions (new model — supersedes the old role matrix)

One Super Admin (the seeded account) bypasses everything. Every other
member has a job title only (Project Manager, Sales Executive, Developer,
Designer) — the title grants nothing by itself. Access comes only from
`PermissionGrant` rows (one per user + module, level `NONE` / `ASSIGNED` /
`ALL`), enforced server-side on every API route: `NONE` → 403,
`ASSIGNED` → only records assigned to them, `ALL` → unscoped. No new
`SUPER_ADMIN` or `ADMIN` accounts can be created (the `ADMIN` enum value
is kept in the schema only so existing data stays valid). The Super Admin
grants permissions in the Team page's per-member permission table, saved
via `PUT /api/users/[id]/permissions` (Super Admin only, audit-logged);
members start with no access until granted. Full matrix, assigned-scope
definitions, and exceptions (e.g. suppression list requires `EMAILS=ALL`,
suppression removal stays Super-Admin-only): see `docs/rbac-matrix.md`.

## CRM gap updates (2026-11-03, built locally, NOT deployed yet)

Schema changes are additive only (applied by `prisma db push` on deploy).
No email-sending code, Gmail OAuth, calendar sync, or external service
was added. Permission logic itself is unchanged.

### 1. International contact model
Company and Contact both carry `timezone` (free text, e.g.
Asia/Karachi, Europe/London, America/New_York), `language` (free text,
e.g. English, Spanish), `currency` (ISO code; UI Select offers USD, EUR,
GBP, AED, SAR, PKR), and `gdprConsentNote` (text). Contact additionally
carries `gdprConsent` (boolean, default false — consent is never
assumed). All four are in the Zod schemas, create/edit forms, detail
pages, and list filters (companies list: country/currency/language).
The existing `country` field is untouched.

### 2. Multi-currency, done safely
Currencies are NEVER mixed in one total. Deals list/board totals, the
dashboard won-value chart, and weighted pipeline value are grouped BY
currency — one labelled total per currency (e.g. "USD 12,000 ·
EUR 8,500"). A deal with no/empty currency falls in an "Unspecified"
group, never merged into another currency's total. Helpers:
`src/lib/currency.ts` (`groupTotalsByCurrency`, `formatCurrencyTotals`).
The dashboard won chart is now grouped by month AND currency, plus a
per-currency totals line (`wonRevenueByCurrency`).

### 3. Saved views
On the Companies and Deals lists, the signed-in user can save the
current filter set under a name, apply one in one tap, and delete it.
Model `SavedView` (userId FK cascade, module "companies"|"deals", name,
filters Json, `@@index([userId, module])`); API under `/api/saved-views`
(GET mine, POST, DELETE mine only — another user's view can never be
read/applied/deleted). Applying a view only ever filters: list routes
still AND the caller's PermissionGrant scope, so a view can never widen
access.

### 4. Basic quote record
Model `Quote` (dealId FK SetNull on deal delete — same as
Project.dealId; companyId denormalised from the deal's company at
creation, so quotes stay listable per company after a deal is deleted;
title, currency default USD, status DRAFT|SENT|ACCEPTED|REJECTED,
notes, createdById FK SetNull) plus `QuoteLineItem` (quoteId FK cascade,
description, quantity, unitPrice, position). The total is NEVER
hand-typed: total = sum(quantity × unitPrice), computed server-side on
every read and every line-item write, and no total column is stored.
Full CRUD API under `/api/quotes` (incl. `/lines` endpoints); list and
detail pages under Deals (`/deals/quotes`, `/deals/quotes/[id]`), every
deal card links to its quotes, and the detail page has a Print button
using a browser print stylesheet (`.quote-print` in globals.css, no PDF
service). Permission module is DEALS, since quotes belong to deals —
documented choice, no new grant module added. Accepting a quote does
NOT change the deal stage; the user moves the deal explicitly.

### 5. Simple internal automation (no external service)
When an email activity's status is set to FOLLOW_UP_REQUIRED through any
API path that changes email status (status endpoint, email PATCH,
email create, email CSV import) AND the email has no followUpDate, the
API automatically creates one PENDING FollowUp for the email's assigned
employee (falling back to the acting user), dated 3 days after the
status change, reason "Auto follow-up from email", notes referencing
the email subject. De-duplication: auto rows carry
`FollowUp.autoForEmailId` (the email id); the API checks it before
creating, so re-saves never duplicate. Implementation:
`maybeCreateAutoFollowUp` in `src/app/api/emails/shared.ts`. The auto
row's reason deliberately differs from the `Follow-up for tracked email
<id>` prefix used by `syncFollowUpForActivity`, so the two mechanisms
never clobber each other (sync only touches prefix rows, and only when
a followUpDate exists — exactly when this automation does not run).
The deals Stale/rotting flag (kanban rule: open deal whose
expected-close day has passed OR updatedAt, fallback createdAt, is 30+
days old) now shows on the deals LIST view as well — both views render
the same deal card, so the flag is present in both by construction.

### 6. Pipeline stage rules
Stage exit checks, enforced SERVER-SIDE in the deal move route (and in
deal PATCH when the stage changes, against the resulting figures):
moving to PROPOSAL_SENT requires estimatedBudget OR finalPrice present;
moving to WON requires finalPrice present. Other moves are unchanged,
and the error message returned to the UI names the missing figure.
Stage probabilities are a FIXED display standard, never per-deal
invented values, in `src/lib/deal-stages.ts`:
New Lead 10, Contacted 20, Follow-up 30, Interested 40,
Meeting Scheduled 50, Meeting Completed 60, Proposal Sent 70,
Negotiation 80, Won 100, Lost 0. The probability shows on deal cards
(list + board); weighted pipeline value (value × probability / 100,
grouped by currency) shows on the deals page.

### Stretch (not built)
Multiple pipelines (a Pipeline model, existing deals assigned to a
Default pipeline, pipeline selector on the deals page) was NOT built —
it is the next item after items 1–6 above.
