// Shared Prisma include shapes for the Projects/Tasks module.
// Underscore prefix: Next.js never serves this file as an endpoint,
// so exporting constants from here (unlike from a route.ts) is safe.

export const PROJECT_INCLUDE = {
  company: { select: { id: true, name: true } },
  manager: { select: { id: true, name: true, email: true } },
  developers: { select: { id: true, name: true, email: true } },
  deal: { select: { id: true, title: true } },
  _count: { select: { tasks: true } },
} as const;

export const TASK_INCLUDE = {
  project: { select: { id: true, name: true } },
  assignedTo: { select: { id: true, name: true, email: true } },
  _count: { select: { comments: true } },
} as const;
