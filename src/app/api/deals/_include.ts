export const DEAL_INCLUDE = {
  company: { select: { id: true, name: true } },
  contact: { select: { id: true, fullName: true } },
  assignedTo: { select: { id: true, name: true, email: true } },
  projects: { select: { id: true, name: true, status: true } },
} as const;
