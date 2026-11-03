# CraftThink Business OS — Permission Model (RBAC)

> Companion to `prd.md` and `architecture.md`.
> **Golden rule: members see only tasks given to them or info shared with
> them — nothing else.**
> This model is enforced **server-side on every API route**
> (`src/lib/rbac.ts`, `moduleAccess()` + scoped Prisma queries).
> Hiding a sidebar link is presentation only and grants nothing.

## 1. One Super Admin, job titles, and permission rows

There is exactly **one Super Admin**: the seeded account. The Super Admin
bypasses every permission check, manages the team, and is the only user
who may remove a suppression entry.

Every other user has a **job title** — one of:

| Job title | Meaning |
|---|---|
| PROJECT_MANAGER | Delivery lead (title only) |
| SALES_EXECUTIVE | Outreach / closer (title only) |
| DEVELOPER | Builder (title only) |
| DESIGNER | Designer (title only) |

A job title is **display / title only: it grants nothing by itself**.
A Developer and a Sales Executive with the same permission rows see
exactly the same data. Access comes only from **`PermissionGrant` rows**
(`prisma/schema.prisma`): one row per (user, module), with a level.

There is **no separate full-control role to grant**. The old `ADMIN`
value still exists in the `Role` enum in the schema — removing it would
break existing data — but it is not offered anywhere in the UI, and the
API rejects creating a user with role `SUPER_ADMIN` or `ADMIN` (403),
and rejects changing a member's role to either of them (403). Existing
`ADMIN` rows, if any, grant nothing on their own: such a user only sees
what their `PermissionGrant` rows allow.

A member with **no grant row for a module defaults to `NONE`** for that
module. New members therefore start with no access until the Super Admin
grants it in the Team page's permission table.

## 2. Modules and levels

Modules (`MODULES` in `src/lib/rbac.ts`):

| Module | Covers |
|---|---|
| COMPANIES | Companies, contacts, tags, CSV import/export |
| CAMPAIGNS | Campaigns |
| TEMPLATES | Shared email templates (read = shared library) |
| EMAILS | Email activity tracking, lookups, CSV import, suppression* |
| FOLLOW_UPS | Follow-ups |
| MEETINGS | Meetings |
| DEALS | Deals, stage moves, deal → project conversion |
| PROJECTS | Projects |
| TASKS | Tasks and task comments |
| ACTIVITY_LOG | Activity log |
| TEAM | Team member listing |
| SETTINGS | Reserved: no settings API route exists yet, so this grant currently gates nothing server-side (the Settings page only changes the caller's own password via the auth route) |

Levels (`NONE` < `ASSIGNED` < `ALL`):

| Level | List | Single record | Create | Edit / delete |
|---|---|---|---|---|
| **NONE** | 403 | 403 | 403 | 403 |
| **ASSIGNED** | Only records in the assigned scope below | 403 if the record exists but is outside scope; 404 only if it does not exist | Allowed, but the record must be assigned to the caller (assignee/owner forced to self; naming someone else is 403) | Only records in scope; reassigning to someone else is 403 |
| **ALL** | Everything | Everything | Any assignee/owner | Everything |

### What "assigned" means (role-independent)

- **COMPANIES**: company assigned to the user, or a company of a project
  they manage, develop on, hold a task on, or have a meeting on.
- **CAMPAIGNS**: campaign owned by the user (`ownerId`).
- **EMAILS**: email activity assigned to the user (`assignedToId`) only.
- **FOLLOW_UPS / MEETINGS / DEALS**: record assigned to the user, or a
  record of a company assigned to the user.
- **PROJECTS**: project managed by the user, developed on by the user,
  or holding a task assigned to the user.
- **TASKS**: task assigned to the user, or a task on a project they
  manage or develop on.
- **ACTIVITY_LOG**: actions performed by the user (`actorId`).
- **TEAM**: the user themselves (list shows only their own row).
- **TEMPLATES**: templates have no owner, so `ASSIGNED` may **read** the
  shared library (needed to compose assigned emails) but may **not**
  create, edit, or delete templates — those require `ALL`.

### Exceptions (fail-closed, documented)

- **Deletion of companies, contacts, email records, deals, and projects
  requires `ALL`** in that module, even for a record inside an
  `ASSIGNED` scope. Follow-ups, meetings, and tasks may be deleted by
  an in-scope `ASSIGNED` caller (tasks: project manager/developer only,
  not a mere assignee).
- **Suppression** has no per-record owner, so the suppression list
  routes require `EMAILS=ALL`; **removing** a suppression entry stays
  **Super-Admin-only**, because a mistaken removal re-exposes someone
  who asked to stop. (Recording an unsubscribe through an email status
  change still works internally and is not a route.)
- **Reopening a Won/Lost deal** requires `DEALS=ALL`.
- **Full project edits** require `PROJECTS=ALL` or being the project
  manager; a developer who can see a project may not edit it.
- **Task assignees** may update only their own task's status/progress;
  full task edits need `TASKS=ALL`, the project manager, or a project
  developer.
- **Cross-module references**: creating a follow-up, meeting, deal,
  project, or email record also requires the referenced company to be
  visible under the caller's `COMPANIES` grant (and a referenced deal /
  campaign under its own grant). A `COMPANIES=NONE` caller cannot create
  records pointing at a company.
- **Dashboard stats/coverage** are computed per module: a `NONE` module
  contributes 0 / empty, `ASSIGNED` contributes only assigned rows.
  A user with no grant at all gets 403 from stats.
- **Company detail** embeds related lists (emails, follow-ups,
  meetings, deals, projects); each list is emptied when its module is
  `NONE`, and its activity timeline follows the `ACTIVITY_LOG` grant
  (`ASSIGNED` = own actions only).

## 3. Examples

**Allow:** A Developer has `EMAILS=ASSIGNED` and an email activity with
`assignedToId` = that developer. `GET /api/emails/<id>` returns it, and
the emails list shows it.

**Block (detail):** The same Developer requests an email activity
assigned to someone else. The record exists, but it is outside their
scope, so `GET /api/emails/<id>` returns **403** (not the record, and
not a misleading 404-for-existing).

**Block (module):** The same Developer has `COMPANIES=NONE`. Every
Companies API route returns **403** for them — list, detail, create,
contacts, tags, import, and export — regardless of their job title.

**Allow (title does not matter):** A Designer granted `PROJECTS=ALL`
sees every project, while a Project Manager granted `PROJECTS=NONE`
sees none. The title never overrides the grant row.

## 4. Team management (Super Admin only)

Only the Super Admin may:

- list the full team (`TEAM=ALL` members may list only themselves),
- create users (job titles only; `SUPER_ADMIN`/`ADMIN` rejected),
- change a member's job title (never to `SUPER_ADMIN`/`ADMIN`) or
  deactivate/reactivate them,
- grant permissions via `PUT /api/users/[id]/permissions`
  (validates module + level, upserts the `PermissionGrant` row, writes
  an `PERMISSION_GRANTED` audit log entry).

Standing guards are unchanged: a user cannot deactivate their own
account, and the last active Super Admin cannot be demoted or
deactivated. Auth routes are unchanged except that change-password
stays self-only; the seeded Super Admin remains the one Super Admin.

## 5. Special rules (unchanged)

1. **Suspended users lose everything immediately.** A deactivated
   account fails auth before any permission check.
2. **Audit covers writes**, including permission grants. Permission
   failures return 403 without leaking the record.
3. **No self-approval / no new full-control accounts.** See §1 and §4.
4. **No email is sent by this app.** Email routes only track records
   sent elsewhere; this model adds no sending code and no Gmail OAuth.

## 6. Implementation map

- `prisma/schema.prisma` — `PermissionGrant` model,
  `@@unique([userId, module])`, cascade delete with the user.
- `src/lib/rbac.ts` — `MODULES`, `PermLevel`, `getPermission`
  (default `NONE`, Super Admin always `ALL`), `requirePermission`,
  `requireModuleAccess` / `moduleAccess` (401 vs 403), assigned-scope
  `where` builders, `isAssignedRecord`. Legacy `can` / `requireRole`
  remain for unmigrated callers only and must not gate a module route.
- `src/lib/validation.ts` — `permissionGrantSchema`
  `{ userId, module, level }`, `memberCreateSchema` /
  `memberPatchSchema` (job titles only).
- `src/app/api/companies/_scope.ts` — `*ScopeForLevel` variants
  (`ALL` = unscoped, `ASSIGNED` = assigned scope, `NONE` = matches
  nothing); `isPrivileged` now means Super Admin only.
- `src/app/api/users/[id]/permissions/route.ts` — Super-Admin-only
  grant read/upsert.
- `src/app/(dashboard)/team/page.tsx` — Super-Admin-only Team page:
  member list with job title, job-title-only create form, and a
  per-member permission table (one control per module).
