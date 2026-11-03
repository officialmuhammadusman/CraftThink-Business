# CraftThink Business OS — RBAC Permission Matrix

> Companion to `prd.md` and `architecture.md`.
> **Golden rule: employees see only assigned data unless explicitly authorised.**
> "Assigned" = owner/assignee/manager on that record, or a member of its project.
> This matrix is enforced **server-side on every API route** (see `architecture.md`
> §5.2). UI hiding is presentation only and grants nothing.

## 1. Roles

| Role | Who (in a 2-person-first team) | Short description |
|---|---|---|
| **Super Admin** | Founder/CEO (1 person) | Owns the system. Only role that manages users/roles and can remove suppression entries. |
| **Admin** | Trusted manager / second founder | Day-to-day management of all business data and most settings. Cannot create Super Admins or change another Admin's role (see §3). |
| **Project Manager** | Delivery lead | Owns projects and tasks; sees sales data only for deals/projects assigned to them. |
| **Sales Executive** | Outreach / closer | Owns leads, campaigns, deals, meetings assigned to them. |
| **Developer** | Builder | Works assigned project tasks; sees project context for assigned work only. |
| **Designer** | Designer | Same shape as Developer, for design work. |

No role is "everyone can see everything" except Super Admin and Admin.
A user has exactly one role in v1 (no multi-role, no per-record custom roles).

## 2. Matrix

Legend: **●** = allowed · **◐** = only assigned/own data · **—** = not allowed.
"Assigned" for leads/emails/deals = owner; for projects/tasks = manager/assignee/
project member; for meetings = organiser or attendee on that meeting.

### 2.1 Leads (companies, contacts, tags, import, timeline, notes)

| Action | Super Admin | Admin | Project Mgr | Sales Exec | Developer | Designer |
|---|---|---|---|---|---|---|
| View companies / contacts | ● | ● | ◐ (for assigned projects' companies) | ◐ (own leads) | ◐ (assigned projects' companies only) | ◐ (assigned projects' companies only) |
| Create company / contact | ● | ● | — | ● | — | — |
| Edit company / contact | ● | ● | — | ◐ (own) | — | — |
| Delete / archive company / contact | ● | ● | — | — (request to Admin) | — | — |
| CSV import contacts | ● | ● | — | ● (imports become own) | — | — |
| Manage tags (create/delete) | ● | ● | — | ● (create; delete own use only via Admin) | — | — |
| Add note to a contact | ● | ● | ◐ (assigned) | ◐ (own) | ◐ (assigned project contact) | ◐ (assigned project contact) |
| View full contact timeline | ● | ● | ◐ (assigned) | ◐ (own) | ◐ (assigned) | ◐ (assigned) |

### 2.2 Emails (templates, campaigns, sequences, sending, replies, suppression)

| Action | Super Admin | Admin | Project Mgr | Sales Exec | Developer | Designer |
|---|---|---|---|---|---|---|
| View templates | ● | ● | — | ● (all active templates — templates are shared content, not personal data) | — | — |
| Create / edit template | ● | ● | — | ● | — | — |
| Delete / deactivate template | ● | ● | — | — (Admin only, to avoid breaking live campaigns) | — | — |
| Create campaign | ● | ● | — | ● | — | — |
| Edit campaign (draft only) | ● | ● | — | ◐ (own, draft only) | — | — |
| Start / pause / resume campaign | ● | ● | — | ◐ (own) | — | — |
| Enroll contacts in campaign | ● | ● | — | ◐ (own contacts, own campaigns) | — | — |
| Send manual email | ● | ● | — | ◐ (own contacts; send gate always applies) | — | — |
| View email activities / replies | ● | ● | — | ◐ (own contacts/campaigns) | — | — |
| Classify a reply (positive/negative/follow-up-required) | ● | ● | — | ◐ (own) | — | — |
| Create / complete follow-ups | ● | ● | ◐ (own follow-ups) | ◐ (own) | ◐ (own) | ◐ (own) |
| View suppression list | ● | ● | — | ◐ (check own contacts only — no full-list export) | — | — |
| Add to suppression list | ● | ● | — | ● (any unsubscribe/bounce they record, for their contacts) | — | — |
| Remove from suppression list | ● | — | — | — | — | — |
| View campaign analytics | ● | ● | — | ◐ (own campaigns) | — | — |

Notes: template *content* is shared (everyone selling should use the same good
templates), but campaign *audiences and results* are per-owner. Suppression
removal is Super-Admin-only because a mistaken removal re-exposes someone who
asked to stop — the highest-risk undo in the system.

### 2.3 Deals (pipeline, stages, value)

| Action | Super Admin | Admin | Project Mgr | Sales Exec | Developer | Designer |
|---|---|---|---|---|---|---|
| View deals / pipeline board | ● | ● | ◐ (deals linked to assigned projects) | ◐ (own) | ◐ (deals linked to assigned projects) | ◐ (deals linked to assigned projects) |
| Create deal | ● | ● | — | ● (from own contacts) | — | — |
| Edit deal (title, value, close date) | ● | ● | — | ◐ (own) | — | — |
| Move deal stage | ● | ● | — | ◐ (own) | — | — |
| Reopen Won / Lost deal | ● | ● | — | — | — | — |
| Mark deal Lost (with reason) | ● | ● | — | ◐ (own) | — | — |
| Delete / archive deal | ● | ● | — | — | — | — |
| View pipeline analytics | ● | ● | ◐ (assigned scope) | ◐ (own) | — | — |

### 2.4 Meetings

| Action | Super Admin | Admin | Project Mgr | Sales Exec | Developer | Designer |
|---|---|---|---|---|---|---|
| View meetings | ● | ● | ◐ (own / assigned-project) | ◐ (own / attendee) | ◐ (attendee) | ◐ (attendee) |
| Create meeting | ● | ● | ◐ (for assigned projects/deals) | ● (own contacts/deals) | — | — |
| Edit / complete meeting, record outcome | ● | ● | ◐ (own) | ◐ (own) | — | — |
| Cancel meeting | ● | ● | ◐ (own) | ◐ (own) | — | — |

### 2.5 Projects and tasks (M4)

| Action | Super Admin | Admin | Project Mgr | Sales Exec | Developer | Designer |
|---|---|---|---|---|---|---|
| View projects | ● | ● | ◐ (managed / assigned) | ◐ (own won deals' projects, read-only) | ◐ (assigned) | ◐ (assigned) |
| Create project (from won deal) | ● | ● | ● (assigned deals) | — (request to PM/Admin) | — | — |
| Edit project (status, dates) | ● | ● | ◐ (managed) | — | — | — |
| Create task | ● | ● | ◐ (managed projects) | — | — | — |
| Edit / complete own task | ● | ● | ◐ (managed projects) | — | ◐ (own tasks) | ◐ (own tasks) |
| Reassign task | ● | ● | ◐ (managed projects) | — | — | — |
| Delete project / task | ● | ● | — (archive only, via Admin) | — | — | — |

### 2.6 Users, settings, analytics, audit

| Action | Super Admin | Admin | Project Mgr | Sales Exec | Developer | Designer |
|---|---|---|---|---|---|---|
| View user list | ● | ● | — (see teammates on assigned projects only) | — | — | — |
| Create user / change role / suspend | ● | — | — | — | — | — |
| Admin changes another Admin's role | — (only Super Admin) | — | — | — | — | — |
| Edit own profile (name, password) | ● | ● | ● | ● | ● | ● |
| Edit business settings | ● | ● | — | — | — | — |
| Edit sending settings (caps, windows, accounts) | ● | ● | — | — | — | — |
| View dashboard (own scope) | ● | ● | ● (own scope) | ● (own scope) | ● (own scope) | ● (own scope) |
| View full analytics (all users) | ● | ● | — | — | — | — |
| Export data (CSV) | ● | ● | — | ◐ (own contacts/deals only) | — | — |
| View audit log | ● | ● | — | — | — | — |

## 3. Special rules

1. **Super Admin is not transferable by Admins.** Only a Super Admin can create
   another Super Admin, change an Admin's role, or remove a suppression entry.
   There must always be at least one active Super Admin — the API rejects the
   action that would leave zero.
2. **Assignment is the default; "view all" is the exception.** If a permission
   above says ◐, the API scopes the query to assigned records. A Sales Executive
   asking for another executive's contact by ID gets 403 (or 404 — implementation
   choice, but never the record). Never leak existence through differing errors
   in a way that enumerates others' data; 404-for-unauthorised is acceptable and
   preferred for single-record reads.
3. **Project membership grants limited sales visibility.** A Developer on a
   project can see that project's company/contact/deal context (so they can do
   the work) but cannot edit sales records, enroll contacts, or send email.
4. **No self-approval.** A user cannot approve their own role change, suppression
   removal, or Won/Lost reopen — those actions require a different authorised
   user where the matrix requires one (Super Admin / Admin).
5. **Suspended users lose everything immediately.** Suspension revokes sessions;
   a suspended user's API calls fail auth before RBAC is even evaluated.
6. **Audit covers permission failures too.** Repeated 403s on the same resource
   are logged (potential probing) and visible to Super Admin / Admin in the audit log.
7. **Authorisation can be granted per-record, not just per-role, in one case:**
   an Admin/Super Admin may reassign a record's owner. Reassignment is logged with
   old/new owner and is the only way an employee gains visibility of a record
   they did not own — there is no ad-hoc "share this contact" button in v1.

## 4. How the scaffold should implement this

- A single `lib/rbac.ts` with a `can(actor, action, resource)` function and a
  `scopeWhere(actor, resource)` helper that returns the Prisma `where` clause
  for list queries. Every API route calls it first; no route hand-rolls its own
  permission logic.
- Permission names mirror this document (e.g. `leads.view`, `campaigns.start`,
  `deals.move`, `suppression.remove`, `users.manage`) so a future reviewer can
  diff code against this matrix line by line.
- Tests (when the scaffold adds them) should cover at minimum: Sales Executive
  cannot read another executive's contact; Developer cannot send email;
  non-Super-Admin cannot remove a suppression entry; suspended user cannot log in.
