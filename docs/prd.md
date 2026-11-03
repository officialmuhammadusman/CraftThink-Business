# CraftThink Business OS — Product Requirements Document (PRD)

> Status: Research draft, 2026-11-03. Internal tool only — not a product for sale.
> No accounts were created, no emails sent, no paid services used for this research.
> Vendor feature/price claims below are summaries of public pages found during research;
> where sources disagreed, that is marked **uncertain**. Re-check a vendor's own current
> page before relying on any limit. No prices are quoted here on purpose.

## 1. What this is

**CraftThink Business OS** is the internal operating system for CraftThink, a small
remote software house. One place where the team keeps leads, runs cold-email outreach,
follows up, closes deals, and then delivers the work — instead of juggling spreadsheets,
inboxes, and scattered notes.

**First priority: cold-email client acquisition.** Everything in v1 is judged by one
question: *does this help us find a real prospect, send a good first email, follow up
on time, and book a meeting — without burning the sending domain or spamming anyone?*

**First user shape: 2 people** (founder/CEO + one sales/delivery person), growing later
to a small team. The design must stay usable with 2 users and not assume a sales
department, a RevOps team, or a large sending operation.

**Explicitly not:** a public CRM product, a bulk-mail blaster, a lead-database vendor,
a marketing-automation suite, or a replacement for the public CraftThink website.
It is an internal tool for CraftThink's own pipeline.

## 2. Problem it solves

Today the failure modes of a small agency's outreach are mundane, not exotic:

1. Leads live in many places; nobody knows who was emailed, when, or what they said.
2. Follow-ups are forgotten — the second and third email are where replies usually come from.
3. A reply arrives and nobody owns it, or the same prospect gets emailed twice.
4. Deals stall invisibly: no next step, no owner, no date.
5. Once a deal is won, delivery (projects/tasks) is disconnected from the sale.
6. Sending too fast, to bad addresses, or to people who unsubscribed damages the
   domain — and that damage is hard to undo.

The OS exists to make the boring discipline automatic: one record per prospect,
one next step per deal, one suppression rule that is never bypassed.

## 3. What we learned from existing tools (useful features only)

Researched from public pages (Nov 2026 searches): HubSpot CRM, Pipedrive,
Instantly, Apollo, plus Close and Lemlist for comparison. Nothing below is copied
blindly; each row says what CraftThink borrows and what it simplifies.

| Tool | Borrow for CraftThink | Simplify / do NOT copy |
|---|---|---|
| **HubSpot CRM** | Contacts + companies + deals as linked records; one shared timeline of emails, notes, meetings, tasks per record; deal pipeline with stages; dashboards; email templates/snippets | Its full marketing/service hub sprawl, multi-pipeline complexity, workflow builder, and AI suite. v1 needs ONE pipeline (see §5), not many. Free-tier limits reported by third parties conflict (e.g. contact caps) — **uncertain**, not relied on. |
| **Pipedrive** | Visual kanban pipeline; the rule "every open deal has a named next activity"; Leads Inbox concept (unqualified leads kept separate from deals); deal-rotting / stalled-deal flags; activity-based selling (call/meeting/email/task tied to a record) | Multiple pipelines, product catalogues, forecasting, and its add-on marketplace. One pipeline + one "next activity" rule is enough. |
| **Instantly** | Campaign = multi-step sequence; per-inbox daily sending cap; inbox rotation across sending accounts; warm-up as a background concept; unified reply inbox; stop-on-reply / stop-on-bounce / stop-on-unsubscribe; campaign analytics (reply rate, bounce rate — open rate is unreliable since Apple Mail Privacy Protection inflated opens) | Its scale machinery (unlimited inboxes, large warm-up networks, lead database, AI SDR agent). CraftThink v1 sends from 1–2 inboxes at low, safe volume — rotation is a design hook, not a day-one fleet. |
| **Apollo** | Prospect search filters (industry, role, location, company size); verified-email idea; enrichment fields (role, company, size, location); sequences with delays and tasks | The 240M+ contact database itself — CraftThink will NOT build or buy a database in v1. Import/verify manually; enrichment is a future integration, not a v1 promise. Its "98% accuracy" is a vendor claim, **unverified** here. |
| **Close** | CRM-first + sequences in one place; sequences that pause on reply; Smart Views (saved filtered lists); built-in calling/task workflow idea | Power/predictive diallers, SMS, and its reporting depth. v1: email + manual call/meeting tasks only. |
| **Lemlist** | Multichannel sequence idea (email first, LinkedIn/manual tasks as steps); deliverability hub idea (domain health at a glance); personalisation variables (`{{firstName}}`, `{{company}}`) and template variables | LinkedIn automation, WhatsApp/calls, AI image/video personalisation, landing pages. v1 sequences are email + manual-task steps only; LinkedIn steps, if any, are manual checklists, never automated sends. |

**Cross-cutting lesson from all of them:** the tools that work for small teams win on
*one next action per record* and *stop rules that protect the sender*, not on feature
count. That is the design principle for v1.

## 4. Users and roles (summary — full matrix in `rbac-matrix.md`)

- **Super Admin** — owns the system, users, settings, suppression list, all data.
- **Admin** — day-to-day management, all data, most settings (not user/role creation
  beyond what Super Admin allows — see matrix).
- **Project Manager** — owns delivery: projects, tasks, meetings for assigned work.
- **Sales Executive** — owns outreach: leads, campaigns, follow-ups, deals assigned to them.
- **Developer / Designer** — work on assigned projects/tasks; see only what they are
  assigned to, plus their own tasks and meetings.

**Golden rule:** employees see only assigned data unless explicitly authorised.
Enforced server-side on every API route, never by hiding buttons in the UI alone.

## 5. MVP scope

### 5.1 Phased scope

| Phase | Contents | Goal |
|---|---|---|
| **M0 — Foundation** | Auth (email/password, secure cookie sessions), users + roles, RBAC middleware, audit log, settings, dashboard shell | A safe, empty system only the right people can open |
| **M1 — CRM core** | Companies, contacts, tags, lead import (CSV), lead detail + timeline, lead → deal conversion, activity log | One source of truth for every prospect |
| **M2 — Cold-email core (FIRST PRIORITY)** | Templates with variables, campaigns + sequences (multi-step, delays, sending windows, daily cap), sending queue, email activity statuses, reply tracking (manual + inbox check), follow-ups, suppression list, unsubscribe handling, campaign analytics | Send good cold email safely and never lose a reply |
| **M3 — Sales** | 10-stage deal pipeline (kanban), meetings, proposals (simple record + link/file reference, not a document builder) | Turn replies into meetings and meetings into deals |
| **M4 — Delivery** | Projects linked to won deals, tasks, basic project status | Hand a won deal to delivery without losing context |

**MVP = M0 + M1 + M2, with a thin slice of M3** (deal pipeline + meetings; proposals
as a simple record). M4 (projects/tasks) is built after the sales loop works, not in
parallel — the task statement lists sales/projects as "later", and this PRD keeps that order.

### 5.2 In scope for v1 (must-have)

- Companies and contacts with tags, source, status, owner/assignee, notes.
- CSV import with duplicate detection on email (same email = same contact, never two).
- Lead detail page: all emails, notes, meetings, tasks, deal history on one timeline.
- Templates: subject + body, variables (`{{firstName}}`, `{{company}}`, `{{role}}`,
  `{{senderName}}`), preview with a real contact before sending.
- Campaigns: pick contacts (or a tag/filter), pick a sequence of steps, set sending
  window (days + hours, recipient timezone where known, else sender timezone),
  daily cap per sending account, delay between steps (days).
- Sending queue: emails are queued, not blasted. A worker/cron processes the queue
  inside the window and under the cap. Manual "send now" for single emails is allowed
  only if it also passes suppression + cap checks.
- Email activity statuses (full list in `architecture.md`):
  `draft / scheduled / sent / delivered / bounced / replied / positive / negative /
  follow-up-required / unsubscribed`.
- Reply handling: a reply stops the sequence for that contact automatically once
  recorded; a human classifies it as positive / negative / follow-up-required.
  (Automated reply classification is NOT v1 — a human reads and tags replies.)
- Follow-ups: auto-created follow-up tasks when a sequence step is due or a reply
  needs action; overdue follow-ups are visible on the dashboard.
- Suppression list: global, checked on EVERY send attempt (campaign, sequence step,
  and manual send). Unsubscribe link in every cold email; one-click handling route
  that adds the address and stops all sequences for it immediately.
- Deal pipeline (10 stages, fixed order — see `architecture.md`): kanban board,
  drag between stages, lost-reason required on Lost, value + expected close date.
- Meetings: create/link to a contact/deal, date/time, outcome note, next step.
- Dashboard: today's follow-ups, stalled deals (no activity in X days), campaign
  reply/bounce rates, pipeline totals by stage. No vanity metrics without context.
- Audit log: who did what, when, to which record (creates, stage changes, sends,
  suppression adds, role changes).

### 5.3 Deliberately OUT of v1 (see also §9)

See the report-back list in §9 and the "Out of v1" section of the final handoff.
Headline exclusions: lead database/scraping, automated warm-up network, AI email
writing, AI reply classification, automated LinkedIn outreach, dialler/SMS/WhatsApp
sending, multi-pipeline support, quotes/invoicing, time tracking, client portal,
mobile app, and any public API for third parties.

## 6. Module architecture

```
Business OS
├── Foundation      Auth, sessions, users, roles, settings, audit log
├── CRM             Companies, contacts, tags, import, timeline, notes
├── Outreach        Templates, campaigns, sequences, sending queue, replies,
│                   follow-ups, suppression, analytics
├── Sales           Deals (10-stage pipeline), meetings, proposals (record)
├── Delivery (M4)   Projects, tasks (linked to won deals)
└── Reporting       Dashboard, campaign analytics, pipeline analytics
```

Rules that cut across modules:

1. **Every record has an owner/assignee.** Unassigned records are visible only to
   Admin/Super Admin until assigned.
2. **Every send passes through one gate.** No API route, button, or job may send
   email without checking: suppression list → bounce history → daily cap →
   sending window → sequence stop rules. The gate lives server-side, once, and all
   senders call it.
3. **A contact belongs to a company; a deal belongs to a contact + company; a
   project belongs to a won deal.** No orphan deals or projects in v1.
4. **Status is a state machine, not free text.** Email and deal statuses change only
   through allowed transitions (defined in `architecture.md`); illegal transitions
   are rejected by the API, not just the UI.
5. **Nothing is hard-deleted in v1.** Records are archived/soft-deleted so the audit
   trail and suppression list survive. (GDPR erasure is the exception — see §8.)

## 7. API plan summary (full detail in `architecture.md`)

REST-style routes under `/api/`, all behind auth + RBAC + Zod validation:

| Group | Routes (summary) |
|---|---|
| Auth / me | `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me` |
| Users / roles | `GET/POST /api/users`, `GET/PATCH/DELETE /api/users/[id]` (Super Admin only for role changes) |
| Companies | `GET/POST /api/companies`, `GET/PATCH/DELETE /api/companies/[id]` |
| Contacts | `GET/POST /api/contacts`, `GET/PATCH/DELETE /api/contacts/[id]`, `POST /api/contacts/import` |
| Tags | `GET/POST /api/tags`, `DELETE /api/tags/[id]` |
| Campaigns | `GET/POST /api/campaigns`, `GET/PATCH /api/campaigns/[id]`, `POST /api/campaigns/[id]/start|pause|resume`, `POST /api/campaigns/[id]/enroll` |
| Templates | `GET/POST /api/templates`, `GET/PATCH/DELETE /api/templates/[id]`, `POST /api/templates/preview` |
| Emails / replies | `GET /api/emails` (filtered timeline), `POST /api/emails/[id]/reply-classify`, `POST /api/emails/[id]/unsubscribe` |
| Follow-ups | `GET/POST /api/follow-ups`, `PATCH /api/follow-ups/[id]` (complete/snooze) |
| Deals | `GET/POST /api/deals`, `GET/PATCH /api/deals/[id]`, `POST /api/deals/[id]/move` (stage change with validation) |
| Meetings | `GET/POST /api/meetings`, `GET/PATCH /api/meetings/[id]` |
| Projects / tasks | `GET/POST /api/projects`, `GET/PATCH /api/projects/[id]`, `GET/POST /api/projects/[id]/tasks`, `PATCH /api/tasks/[id]` |
| Suppression | `GET/POST /api/suppression`, `DELETE /api/suppression/[id]` (Super Admin only; deletions logged) |
| Dashboard | `GET /api/dashboard` (scoped to the caller's assignments) |
| Cron / jobs | `POST /api/jobs/process-queue` (protected by a server secret, not by user login), `GET /api/unsubscribe?token=…` (public, token-gated, single purpose) |

Response conventions: JSON, `{ data }` on success, `{ error: { code, message } }`
on failure; validation errors return field-level details; list endpoints paginate
(`?page=&limit=&search=&tag=&owner=&status=`) and never return full tables unbounded.

## 8. Deployment strategy — Vercel-native, no separate backend

**Decision: one Next.js App Router app on Vercel. API Routes are the backend.
PostgreSQL (via `DATABASE_URL`) is the only database. Prisma is the ORM.
No separate NestJS/Express backend server in v1.**

Why, in plain terms:

1. **One thing to deploy, one thing to break.** A separate backend means two
   deployments, two environments, CORS between them, and keeping two services in
   sync — for a 2-person internal tool, that is cost with no benefit. Vercel already
   runs the Next.js app; its API Routes run the same code, on the same deploy.
2. **The team already ships this way.** CraftThink's public site is Next.js on
   Vercel with auto-redeploys. The OS reuses that muscle memory, hosting, and
   preview-deploy workflow instead of introducing a second stack to learn and maintain.
3. **API Routes are enough for this workload.** CRUD, RBAC checks, queueing, and
   sending a few dozen emails a day are ordinary server functions. Nothing in v1
   needs long-lived connections, WebSockets, or a always-on server process.
4. **Prisma + PostgreSQL fits serverless if pooled.** Serverless functions must not
   open unlimited DB connections. Use a pooled connection string (provider pooler,
   e.g. Neon/Supabase pooler or Prisma Accelerate — provider choice is a scaffold-time
   decision, not assumed here) in `DATABASE_URL`, and run migrations with
   `prisma migrate deploy` at deploy time, never ad-hoc against production.
5. **Background work uses cron, not a daemon.** The sending queue is processed by a
   scheduled job (Vercel Cron or an external scheduler hitting the protected job
   route). If a send fails, the queue row stays, retries with back-off, and the
   failure is visible — it does not vanish because a server restarted.

**When to revisit:** if the OS ever needs always-on workers (high-volume sending,
real-time inbox sync, WebSocket collaboration), a dedicated worker service or a
separate backend becomes worth its cost. That is a measured decision later, not a
v1 guess. Until then, adding NestJS would be architecture for a team size and
volume CraftThink does not have.

**Environment notes:**
- Secrets (`DATABASE_URL`, session secret, sending-provider credentials, cron secret)
  live only in Vercel environment variables / `.env.local` — never committed.
- Preview deployments must NOT point at production Postgres (a bad seed or test
  send could touch real prospects). Separate staging database or no database at all
  for previews.
- Sending provider in v1: use a transactional provider (e.g. Resend/SMTP — final
  choice at build time) via a single `lib/email` sender module, so swapping providers
  does not touch campaign code. Domain authentication (SPF/DKIM/DMARC) must be set
  up before the first cold send; the app cannot fix a missing DNS record.

## 9. Milestones

| # | Milestone | Done when… |
|---|---|---|
| M0 | Foundation | Login works, roles enforced server-side, audit log records actions, dashboard shell loads |
| M1 | CRM core | Import a CSV without duplicates; a contact's full timeline is visible; lead → deal conversion works |
| M2 | Cold-email core | A campaign sends inside its window and cap, stops on reply/bounce/unsubscribe, and suppression can never be bypassed in testing |
| M3 | Sales slice | A reply can become a meeting and a deal; kanban moves with validation; stalled deals surface |
| M4 | Delivery slice | A won deal becomes a project with tasks; assignees see only their work |
| M4b | Milestone 2 — Projects/Tasks/Team/Settings (built 2026-11-03) | Full project + task CRUD with server-side assignment scoping, task comments, admin-only Team pages, self-service password change; tracking-only, no sending code added |
| M5 | Hardening | Rate limits, backup/restore check, suppression + bounce drills, docs for daily use |

## 10. Risks and limitations (honest list)

1. **Deliverability is not solved by software alone.** Warm-up, domain reputation,
   list quality, and copy quality matter more than any feature. v1 deliberately
   sends low volume from a properly authenticated domain; anyone promising inbox
   placement from code alone is overselling.
2. **Reply tracking in v1 is partly manual.** Without a full inbox-sync integration,
   replies are recorded by the team (or via a simple inbound webhook if the sending
   provider supports it). A missed reply is a real risk — mitigated by the daily
   "unclassified replies" list on the dashboard, not eliminated.
3. **Compliance is a process, not a checkbox.** CAN-SPAM (US, opt-out, honour within
   10 business days), GDPR legitimate interest + right to object/erasure (EU/UK),
   and stricter national rules (e.g. Germany/Austria reportedly requiring prior
   consent for B2B email — **verify per country before sending there**) all apply
   depending on the recipient. This document is not legal advice. The app enforces
   suppression and unsubscribe; the team owns list legality and the legitimate-
   interest assessment.
4. **Single-database risk.** One Postgres holds everything. Backups and a tested
   restore are part of M5, not an afterthought.
5. **Scope creep is the biggest product risk.** Every "just add" feature (dialler,
   AI writer, client portal) delays the core loop. The out-of-v1 list exists to be
   defended.
6. **Vendor research limits.** Public pages and third-party reviews disagree on
   some limits and prices, and both change. Nothing in §3 should be used to choose
   or buy a vendor without re-checking that vendor's current page.

## 11. The 5–8 most important feature decisions for the MVP

1. **Cold email first, everything else second.** CRM + campaigns + follow-ups ship
   before projects, proposals-as-documents, or analytics depth.
2. **One pipeline, 10 fixed stages.** No multi-pipeline configuration in v1.
   Customisation is a future cost, not a v1 feature.
3. **One server-side send gate, checked everywhere.** Suppression, bounce, cap,
   window, and stop rules live in one function; no route bypasses it.
4. **Stop on reply/bounce/unsubscribe, always.** A sequence never continues past a
   human signal. Replies are human-classified in v1.
5. **Every open deal has a next activity.** Borrowed from Pipedrive; surfaced as
   "stalled deals" when missing or overdue.
6. **Assigned-data-only visibility, enforced server-side.** RBAC is not UI hiding.
7. **Queued, capped, windowed sending — never a blast.** Low volume protects the
   domain; scale comes from more inboxes later, not higher per-inbox volume now.
8. **No lead database, no AI writer, no automation theatre in v1.** Manual import,
   human-written templates, human-classified replies. Quality over volume.

## 12. Deliberately left out of v1 (with reason)

| Left out | Why |
|---|---|
| Lead database / scraping / enrichment API | Cost, legality, and data-quality risk; manual import + verification is safer at this size |
| Automated warm-up network | Needs many inboxes and a network; v1 uses 1–2 real inboxes, warmed manually/gradually |
| AI email writing / AI reply classification | Quality and compliance risk; humans write and classify until volume justifies it |
| Automated LinkedIn outreach | Platform-rule and account risk; LinkedIn steps are manual checklist items only |
| Dialler, SMS, WhatsApp sending | Not the first channel; meetings are booked from email replies |
| Multiple pipelines, custom objects, workflow builder | Configuration burden for a 2-person team; one pipeline is the product |
| Quotes, invoicing, payments, time tracking | Accounting tools exist; proposals stay a simple record + reference in v1 |
| Client portal, mobile app, public API | No audience for them yet; internal web app only |
| Real-time inbox sync / unified inbox | Provider/webhook work; v1 reply handling is manual + dashboard queue |
| Advanced forecasting / lead scoring | Needs history the team does not have yet; pipeline totals + reply rates suffice |
