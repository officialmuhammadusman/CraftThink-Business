# CraftThink Business OS — Architecture

> Companion to `prd.md`. Stack decision (from PRD §8): **Next.js App Router on
> Vercel; API Routes are the backend; Prisma + PostgreSQL via `DATABASE_URL`.**
> No separate NestJS/Express backend in v1. This document describes the data model,
> folder structure, and security plan the scaffold should follow.

## 1. Database ER design

Conventions: every table has `id` (cuid/uuid), `createdAt`, `updatedAt`.
Business records use soft delete (`deletedAt`, null = active) instead of hard
delete, except where GDPR erasure requires true deletion (see §5). All foreign
keys are real Prisma relations, not loose string fields. Indexes on every column
used for filtering: `email`, `status`, `ownerId`/`assigneeId`, `stage`, `dueAt`,
`scheduledAt`, `campaignId`, `contactId`.

### 1.1 Core tables

**users**
| Column | Type / notes |
|---|---|
| id, email (unique), name, passwordHash, role, status (active/suspended), lastLoginAt | `role`: `SUPER_ADMIN / ADMIN / PROJECT_MANAGER / SALES_EXECUTIVE / DEVELOPER / DESIGNER`. Passwords never stored in plain text (§5). |

**companies**
| Column | Type / notes |
|---|---|
| id, name, website, industry, size (e.g. 1-10, 11-50 — free text in v1, not a fixed enum), country, city, source, notes, ownerId → users | One company has many contacts. Dedupe on (name + website/domain) at import, with a manual merge path later (not v1). |

**contacts** (the lead/prospect record; a contact IS a lead until converted)
| Column | Type / notes |
|---|---|
| id, firstName, lastName, email (unique, case-insensitive), phone, role/title, companyId → companies, status, source, ownerId → users, tags (via contact_tags) | `status`: `new / contacted / replied / qualified / unqualified / converted / suppressed / bounced`. `email` unique is the duplicate guard. Suppression is enforced separately (suppression_list) so a suppressed contact can never be re-emailed even if its status is edited. |

**tags / contact_tags**
| Column | Type / notes |
|---|---|
| tags: id, name (unique), colour (optional) | contact_tags: contactId + tagId (composite unique). Tags are also the simplest campaign audience selector in v1. |

**contact_notes** (part of the timeline)
| Column | Type / notes |
|---|---|
| id, contactId, authorId → users, body, createdAt | Notes, like all timeline entries, are append-only in practice; edits are logged. |

### 1.2 Outreach tables

**email_templates**
| Column | Type / notes |
|---|---|
| id, name, subject, body, variables (list of variable names used, derived at save), createdById → users, isActive | Variables: `{{firstName}}`, `{{lastName}}`, `{{company}}`, `{{role}}`, `{{senderName}}`. Rendering escapes/fails closed: an unknown variable renders as empty and is flagged in preview, never as raw `{{…}}` to a prospect. |

**campaigns**
| Column | Type / notes |
|---|---|
| id, name, status, ownerId → users, dailyCap, sendingDays (e.g. Mon–Fri), sendingStartHour, sendingEndHour, timezone, sendingAccountId → sending_accounts (nullable in v1 if single account), createdAt | `status`: `draft / active / paused / completed / archived`. Only one active sending account per campaign in v1; rotation across accounts is a later extension (the table exists so it can be added without a remodel). |

**campaign_steps** (the sequence)
| Column | Type / notes |
|---|---|
| id, campaignId, stepOrder, templateId → email_templates (nullable for manual-task steps), stepType (`email / manual_task`), delayDays (days after previous step), taskTitle (for manual steps) | Step 1 is the first email; later steps are follow-ups. A manual_task step creates a follow-up task instead of sending. |

**campaign_enrollments** (contact × campaign)
| Column | Type / notes |
|---|---|
| id, campaignId, contactId (unique per campaign), status, currentStepOrder, enrolledAt, stoppedAt, stopReason | `status`: `active / completed / stopped_replied / stopped_bounced / stopped_unsubscribed / stopped_manual`. Enrolling a suppressed or hard-bounced contact is rejected by the API. |

**email_activities** (every email the system sends or records — the audit trail of outreach)
| Column | Type / notes |
|---|---|
| id, contactId, campaignId (nullable — manual emails exist), campaignStepId (nullable), enrollmentId (nullable), templateId (nullable), subject, body (rendered copy), fromAccount, status, sentAt, deliveredAt, repliedAt, replyClassification, scheduledAt, errorMessage, providerMessageId | `status` state machine (allowed transitions in §2): `draft / scheduled / sent / delivered / bounced / replied / positive / negative / follow-up-required / unsubscribed`. Note: `replied` is the event; `positive / negative / follow-up-required` are the human classification of that reply, stored both as status and as `replyClassification` so the timeline stays readable. `unsubscribed` is terminal for that contact across all campaigns. |

**sending_accounts** (v1: 1–2 rows)
| Column | Type / notes |
|---|---|
| id, label, email, provider, dailyCap, isActive, warmupNote | Credentials live in env vars, NOT in this table. This table holds routing/cap metadata only. |

**follow_ups**
| Column | Type / notes |
|---|---|
| id, contactId (nullable), dealId (nullable), campaignId (nullable), assigneeId → users, title, dueAt, status, completedAt, source (`sequence / reply / manual / deal`) | `status`: `open / completed / snoozed / cancelled`. At least one of contactId/dealId is required. Overdue = `open` and `dueAt` in the past. |

**suppression_list** (global; checked on every send)
| Column | Type / notes |
|---|---|
| id, email (unique, case-insensitive), reason (`unsubscribed / bounced / complained / manual / negative_reply`), source, addedById → users (nullable for system adds), createdAt | **Never bulk-deleted by non-Super-Admin.** Removal, if ever allowed, is Super-Admin-only and audit-logged. A suppressed email can never be enrolled or sent to, even by manual send — the send gate rejects it before any provider call. |

### 1.3 Sales tables

**deals** — 10-stage pipeline, fixed order in v1:
`New Lead → Contacted → Follow-up → Interested → Meeting Scheduled →
Meeting Completed → Proposal Sent → Negotiation → Won → Lost`

| Column | Type / notes |
|---|---|
| id, title, contactId → contacts, companyId → companies, ownerId → users, stage, value (nullable, currency assumed per-deal note in v1 — no multi-currency logic), expectedCloseDate, lostReason (required when stage = Lost), wonAt, createdAt | A deal is created from a contact (conversion) or manually with a contact attached. `Won` creates the option (not automatic obligation) to create a project (M4). Stage moves go through `POST /api/deals/[id]/move`, which validates the transition and logs it. Backward moves are allowed (deals do stall and restart) but logged; `Won`/`Lost` are terminal — reopening requires an Admin action, logged. |

**meetings**
| Column | Type / notes |
|---|---|
| id, title, contactId (nullable), dealId (nullable), organiserId → users, attendeeEmails, scheduledAt, durationMinutes, meetingLink, outcome, nextStep, status (`scheduled / completed / cancelled / no-show`) | At least one of contactId/dealId is required. Completing a meeting should prompt (not force) a deal stage move and a follow-up. |

**proposals** (v1: record only, not a document builder)
| Column | Type / notes |
|---|---|
| id, dealId → deals, title, status (`draft / sent / accepted / rejected`), sentAt, fileUrl (nullable — link to an externally stored doc), notes | No pricing engine, no e-signature, no PDF generation in v1. |

### 1.4 Delivery tables (M4, defined now so the schema does not need a remodel)

**projects**
| Column | Type / notes |
|---|---|
| id, name, dealId → deals (nullable only for non-deal internal projects), companyId, managerId → users, status (`not-started / in-progress / on-hold / completed / cancelled`), startDate, dueDate, notes | |

**tasks**
| Column | Type / notes |
|---|---|
| id, projectId → projects, title, description, assigneeId → users, status (`todo / in-progress / review / done`), priority (`low / medium / high`), dueAt, completedAt | Assignees see only their tasks (plus projects they are assigned to). |

### 1.5 System tables

**activity_log** (audit trail — append-only; no update/delete API)
| Column | Type / notes |
|---|---|
| id, actorId → users (nullable for system/cron), entityType, entityId, action, details (JSON — old/new values for stage, status, role changes), createdAt | Logged for: logins (success/failure counts only, no passwords), record creates/updates/deletes, stage/status moves, sends, suppression adds/removals, role changes, settings changes. |

**settings** (key/value, Admin+ only)
| Column | Type / notes |
|---|---|
| key (unique), value (JSON/text), updatedById, updatedAt | Keys include: default sending window, default daily cap, stalled-deal threshold days, site name. Secrets are NEVER in this table — env vars only. |

### 1.6 Relationships (summary)

```
users 1—* companies.owner, contacts.owner, deals.owner, campaigns.owner,
           follow_ups.assignee, tasks.assignee, projects.manager
companies 1—* contacts; companies 1—* deals
contacts 1—* email_activities, follow_ups, contact_notes, campaign_enrollments;
         contacts 1—* deals; contacts *—* tags
campaigns 1—* campaign_steps, campaign_enrollments, email_activities
campaign_enrollments *—1 campaigns, contacts
deals *—1 contacts, companies; deals 1—* meetings, proposals; deals 1—0/1 projects
projects 1—* tasks
suppression_list: standalone, referenced by email (not by FK) on every send
activity_log: standalone, references users/entities by id + type
```

## 2. State machines

**Email activity:** `draft → scheduled → sent → delivered → (replied | bounced | unsubscribed)`.
After `replied`, human classification moves it to `positive / negative / follow-up-required`.
`bounced` and `unsubscribed` are terminal and also write to `suppression_list`
(hard bounce → suppression; unsubscribe → suppression). No transition out of
`bounced`/`unsubscribed` via the UI; re-adding requires Super Admin + audit entry,
and is discouraged, not routine.

**Deal:** any stage → any other stage except out of `Won`/`Lost` (Admin-only
reopen, logged). Moving to `Lost` requires `lostReason`. Moving to `Won` stamps `wonAt`.

**Campaign:** `draft → active → paused → active → completed/archived`.
Pausing stops queue processing for that campaign immediately; already-sent emails
are unaffected, scheduled-but-unsent queue rows stay scheduled.

**Follow-up:** `open → completed / snoozed (new dueAt) / cancelled`.

## 3. Folder structure

```
craftthink-business/
├── prisma/
│   ├── schema.prisma          # §1 model; single source of truth
│   └── migrations/
├── src/
│   ├── app/
│   │   ├── (auth)/login/page.tsx
│   │   ├── (app)/               # authenticated layout + pages
│   │   │   ├── dashboard/page.tsx
│   │   │   ├── leads/  companies/  contacts/[id]/
│   │   │   ├── campaigns/  templates/
│   │   │   ├── deals/  meetings/  proposals/
│   │   │   ├── projects/  tasks/
│   │   │   ├── suppression/  users/  settings/  audit/
│   │   └── api/               # Route Handlers — the backend
│   │       ├── auth/  users/  companies/  contacts/  tags/
│   │       ├── campaigns/  templates/  emails/  follow-ups/
│   │       ├── deals/  meetings/  proposals/
│   │       ├── projects/  tasks/  suppression/  dashboard/
│   │       ├── jobs/process-queue/route.ts
│   │       └── unsubscribe/route.ts
│   ├── components/            # UI only; no data fetching with secrets
│   ├── lib/
│   │   ├── prisma.ts          # singleton client (server-only)
│   │   ├── auth.ts            # session read/verify (server-only)
│   │   ├── rbac.ts            # permission checks (server-only)
│   │   ├── validate.ts        # Zod schemas, shared by routes
│   │   ├── email/
│   │   │   ├── sender.ts      # single provider adapter
│   │   │   ├── send-gate.ts   # suppression/bounce/cap/window/stop checks
│   │   │   ├── render.ts      # template variable rendering + preview
│   │   │   └── queue.ts       # enqueue + process logic used by the cron route
│   │   ├── audit.ts           # append-only log helper
│   │   └── rate-limit.ts      # per-IP / per-user limits
│   └── middleware.ts          # route protection: redirect unauthenticated
│                              # users to /login; never the sole RBAC layer
└── docs/                      # prd.md, architecture.md, rbac-matrix.md
```

Rules: `lib/prisma.ts`, `lib/auth.ts`, `lib/rbac.ts`, and anything importing
secrets is server-only (never imported by a client component). Pages are Server
Components by default; client components handle only interaction (kanban drag,
forms), and every mutation still goes through an API route that re-checks RBAC.

## 4. Sending queue and cron (how cold email actually goes out)

1. Campaign start / enrollment creates `email_activities` rows in `scheduled`
   state with `scheduledAt` = next allowed window slot, respecting step delays.
2. A scheduled job (`POST /api/jobs/process-queue`, protected by a server secret
   header — NOT a user session, so it works without a login) runs on a schedule
   (e.g. every 15 minutes during sending hours; exact interval is a deploy setting).
3. Each run: pick due `scheduled` rows (oldest first), and for each, run the send
   gate (§5.4). If the gate passes, send via `lib/email/sender.ts`, mark `sent`,
   and create the next step's scheduled row (or follow-up task for manual steps).
   If the gate fails (suppressed, bounced, cap reached, outside window), mark/stop
   accordingly and log — never silently skip.
4. Failures: provider error → row stays `scheduled` with `errorMessage` and a
   retry count; after N retries (suggested: 3, back-off) it is flagged for human
   review, not retried forever. Cap reached → remaining rows wait for the next day.
5. Replies: v1 records replies manually (team pastes/logs the reply, or an inbound
   webhook if the provider supports it — provider-dependent, not assumed). Logging
   a reply stops the enrollment (`stopped_replied`) and creates a follow-up task
   until classified.

## 5. Security plan

### 5.1 Authentication and sessions
- Email + password only in v1 (no OAuth, no magic links — fewer moving parts).
- Passwords hashed with **bcrypt** (cost factor 12 suggested; never MD5/SHA-1,
  never reversible encryption). Passwords never logged, never returned by any API.
- Sessions: **secure, HttpOnly, SameSite=Lax cookies** holding an opaque session
  token; session rows server-side with expiry (suggested: 7 days, sliding) and
  revocation on logout / password change / suspension. Cookie `Secure` flag on
  in production. No JWT-with-user-data in localStorage.
- Login rate limiting + generic error messages ("invalid email or password" for
  both cases) so account enumeration via login is not trivial.
- `middleware.ts` redirects unauthenticated page visits to `/login`, but it is
  NOT the security boundary — every API route independently verifies session + role.

### 5.2 RBAC — server-side on every API route
- Each route calls `requirePermission(actor, resource, action)` (matrix in
  `rbac-matrix.md`) BEFORE any database read or write. A request that fails the
  check gets 403 and is audit-logged.
- List endpoints scope queries by assignment: e.g. a Sales Executive's
  `GET /api/contacts` adds `ownerId = actor.id` unless they hold an "view all"
  permission. Scoping happens in the Prisma `where` clause, not by filtering
  after fetch.
- Role changes, suppression removals, and settings changes are Super-Admin-only
  (or as the matrix states) and always audit-logged with old/new values.
- Frontend role checks exist only for UX (hiding buttons); they grant nothing.

### 5.3 Input validation and injection safety
- **Zod schemas for every route's body, query, and params.** Invalid input → 400
  with field errors; no route trusts client input.
- Prisma parameterised queries only — no raw SQL built from user input. If raw
  SQL is ever needed, it uses parameter binding and a code-review flag.
- Template rendering: variables are substituted from contact fields only;
  template bodies are NOT executed as code. HTML in templates is limited/sanitised
  in v1 (plain-text-first sending is preferred for cold email deliverability).
- File handling: v1 has no file uploads except CSV import. CSV import parses
  server-side, caps rows (suggested: 5,000 per import) and file size, and rejects
  non-CSV content. Proposal `fileUrl` is a link, not an upload, in v1.

### 5.4 The send gate (compliance + deliverability, server-side, single function)
Every send — campaign, sequence step, or manual — must pass, in order:
1. Recipient is NOT on `suppression_list` (exact email match, case-insensitive).
2. Contact is NOT in `bounced` terminal state and has no hard-bounce history.
3. Enrollment (if any) is `active` and not stopped for reply/unsubscribe/bounce.
4. Daily cap for the sending account not reached (count of `sent` today).
5. Current time is inside the campaign's sending window (days + hours).
6. Unsubscribe footer + sender identity present in the rendered email (enforced
   in the template renderer, not left to the writer's memory).
7. Provider authentication (SPF/DKIM/DMARC) is a deployment prerequisite, checked
   outside the app before first send — the app cannot verify DNS itself in v1.

A gate failure is logged with the reason; the user sees the reason, not a silent skip.

### 5.5 Audit logging
- Append-only `activity_log`; no API route updates or deletes it. Retention:
  keep at least 12 months in v1 (exact retention is a settings decision, not code).
- Log actor, action, entity, timestamp, and old/new values for sensitive changes
  (role, stage, status, suppression). Never log passwords, tokens, or full email
  bodies for non-email entities (email bodies live in `email_activities`, access-
  controlled, not in the general audit log).

### 5.6 Rate limiting and abuse notes
- Login: e.g. 5 failed attempts per IP+email per 15 minutes, then temporary block
  (exact numbers are deploy settings; the mechanism — per-IP + per-account counters
  in the database or an upstash-style store if added later — must exist before launch).
- API: authenticated per-user limits on write endpoints (suggested starting point:
  100 writes/minute/user) to blunt accidental loops; the sending queue has its own
  caps (§4) which are stricter and separate.
- Cron route: secret header + (if the platform supports it) IP/allow-list; a
  leaked cron secret is rotated via env vars, never via code change.
- Unsubscribe route: single-purpose, token-gated (per-contact signed token, expiry
  suggested 90 days), rate-limited, and it only ever ADDS to suppression — it can
  never send email or reveal other contacts.

### 5.7 Secrets, data protection, and GDPR-shaped handling
- Secrets only in env vars (Vercel dashboard / `.env.local`); `.env*` never committed.
- Database access only via pooled `DATABASE_URL`; no direct public DB exposure.
- Backups: provider-automated backups + a tested restore before M5 sign-off.
- Data minimisation: store only business contact fields needed for outreach
  (name, work email, role, company). No personal emails for B2B outreach in v1 policy.
- Erasure: a GDPR erasure request deletes the contact's personal fields and emails
  but KEEPS the suppression entry (email hash/address only) so the person is never
  re-contacted — this is the standard suppression-vs-erasure tension, and the
  suppression entry is the deliberate exception, documented here so it is a choice,
  not an accident. This is process guidance, not legal advice.
- No third-party trackers, no analytics SDKs, no external fonts/scripts phoning
  home from the internal app in v1 — an internal tool should not leak its own
  pipeline to vendors.

## 6. What is intentionally NOT in this architecture (v1)

- No separate backend service, no message broker (queue = database rows + cron),
  no Redis, no WebSockets, no real-time sync engine, no multi-tenancy (one
  CraftThink workspace; multi-tenant isolation is a different product),
  no public API, no OAuth provider integration, no file storage service
  (CSV import is transient; proposal files are external links).
- Each exclusion is reversible later without a remodel: the queue table, the
  sending-account table, and the single sender adapter are the seams where scale
  (more inboxes, a real worker, a second provider) plugs in.
