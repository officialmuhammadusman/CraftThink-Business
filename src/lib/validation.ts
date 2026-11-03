import { z } from "zod";

const optionalText = z.string().trim().max(2000).optional().nullable();
const optionalUrl = z
  .string()
  .trim()
  .url("Must be a valid URL")
  .max(1000)
  .optional()
  .nullable()
  .or(z.literal(""));
const optionalDate = z.coerce.date().optional().nullable();

export const loginSchema = z.object({
  email: z.string().trim().email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

export const companySchema = z.object({
  name: z.string().trim().min(1, "Company name is required").max(255),
  website: optionalUrl,
  industry: z.string().trim().max(255).optional().nullable(),
  country: z.string().trim().max(255).optional().nullable(),
  city: z.string().trim().max(255).optional().nullable(),
  size: z.string().trim().max(100).optional().nullable(),
  linkedinUrl: optionalUrl,
  description: optionalText,
  requirements: optionalText,
  researchNotes: optionalText,
  source: z.string().trim().max(255).optional().nullable(),
  status: z.string().trim().min(1).max(100).default("NEW"),
  priority: z.string().trim().min(1).max(100).default("MEDIUM"),
  assignedToId: z.string().optional().nullable(),
  tagNames: z.array(z.string().trim().min(1).max(100)).max(50).optional(),
});

export const contactSchema = z.object({
  companyId: z.string().min(1, "Company is required"),
  fullName: z.string().trim().min(1, "Full name is required").max(255),
  jobTitle: z.string().trim().max(255).optional().nullable(),
  email: z.string().trim().email("Enter a valid email address"),
  linkedinUrl: optionalUrl,
  phone: z.string().trim().max(100).optional().nullable(),
  isDecisionMaker: z.boolean().default(false),
  notes: optionalText,
});

export const campaignSchema = z.object({
  name: z.string().trim().min(1, "Campaign name is required").max(255),
  description: optionalText,
  ownerId: z.string().optional().nullable(),
});

export const templateSchema = z.object({
  name: z.string().trim().min(1, "Template name is required").max(255),
  industry: z.string().trim().max(255).optional().nullable(),
  subject: z.string().trim().min(1, "Subject is required").max(500),
  body: z.string().trim().min(1, "Body is required").max(20000),
});

export const emailActivitySchema = z.object({
  companyId: z.string().min(1, "Company is required"),
  contactId: z.string().optional().nullable(),
  campaignId: z.string().optional().nullable(),
  templateId: z.string().optional().nullable(),
  recipientEmail: z.string().trim().email("Enter a valid recipient email"),
  senderEmail: z
    .string()
    .trim()
    .email("Enter a valid sender email")
    .optional()
    .nullable(),
  subject: z.string().trim().min(1, "Subject is required").max(500),
  body: z.string().trim().min(1, "Body is required").max(20000),
  sequenceNumber: z.number().int().min(1).default(1),
  status: z.enum([
    "DRAFT",
    "SCHEDULED",
    "SENT",
    "DELIVERED",
    "BOUNCED",
    "REPLIED",
    "POSITIVE",
    "NEGATIVE",
    "FOLLOW_UP_REQUIRED",
    "UNSUBSCRIBED",
  ]),
  sentAt: optionalDate,
  followUpDate: optionalDate,
  assignedToId: z.string().optional().nullable(),
});

export const followUpSchema = z.object({
  companyId: z.string().min(1, "Company is required"),
  contactId: z.string().optional().nullable(),
  dueDate: z.coerce.date(),
  reason: z.string().trim().max(500).optional().nullable(),
  notes: optionalText,
  status: z.enum(["PENDING", "DONE", "OVERDUE"]).default("PENDING"),
  assignedToId: z.string().optional().nullable(),
});

export const meetingSchema = z.object({
  companyId: z.string().min(1, "Company is required"),
  contactId: z.string().optional().nullable(),
  title: z.string().trim().min(1, "Title is required").max(255),
  dateTime: z.coerce.date(),
  platform: z.string().trim().max(255).optional().nullable(),
  link: optionalUrl,
  assignedToId: z.string().optional().nullable(),
  status: z.enum([
    "SCHEDULED",
    "COMPLETED",
    "RESCHEDULED",
    "CANCELLED",
    "NO_SHOW",
  ]),
  notes: optionalText,
  requirements: optionalText,
  budgetNotes: optionalText,
  nextSteps: optionalText,
});

export const dealSchema = z.object({
  companyId: z.string().min(1, "Company is required"),
  contactId: z.string().optional().nullable(),
  title: z.string().trim().min(1, "Title is required").max(255),
  services: z.array(z.string().trim().min(1).max(255)).max(50).default([]),
  estimatedBudget: z.number().nonnegative().optional().nullable(),
  currency: z.string().trim().min(1).max(10).default("USD"),
  expectedCloseDate: optionalDate,
  status: z.enum([
    "NEW_LEAD",
    "CONTACTED",
    "FOLLOW_UP",
    "INTERESTED",
    "MEETING_SCHEDULED",
    "MEETING_COMPLETED",
    "PROPOSAL_SENT",
    "NEGOTIATION",
    "WON",
    "LOST",
  ]),
  finalPrice: z.number().nonnegative().optional().nullable(),
  notes: optionalText,
  assignedToId: z.string().optional().nullable(),
});

// Bonus schemas for the Projects/Tasks module builders (same enums as Prisma).
export const projectSchema = z.object({
  dealId: z.string().optional().nullable(),
  companyId: z.string().min(1, "Company is required"),
  name: z.string().trim().min(1, "Project name is required").max(255),
  description: optionalText,
  budget: z.number().nonnegative().optional().nullable(),
  startDate: optionalDate,
  deadline: optionalDate,
  managerId: z.string().optional().nullable(),
  developerIds: z.array(z.string().min(1)).max(100).default([]),
  status: z.enum([
    "PLANNING",
    "IN_PROGRESS",
    "REVIEW",
    "TESTING",
    "COMPLETED",
    "ON_HOLD",
    "CANCELLED",
  ]),
  techStack: z.array(z.string().trim().min(1).max(100)).max(50).default([]),
  requirements: optionalText,
  internalNotes: optionalText,
});

export const taskSchema = z.object({
  projectId: z.string().min(1, "Project is required"),
  title: z.string().trim().min(1, "Title is required").max(255),
  description: optionalText,
  assignedToId: z.string().optional().nullable(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]),
  startDate: optionalDate,
  deadline: optionalDate,
  status: z.enum(["TODO", "IN_PROGRESS", "REVIEW", "DONE"]),
  progress: z.number().int().min(0).max(100).default(0),
});

export const taskCommentSchema = z.object({
  body: z.string().trim().min(1, "Comment is required").max(5000),
});

export const userCreateSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(255),
  email: z.string().trim().email("Enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
  role: z.enum([
    "SUPER_ADMIN",
    "ADMIN",
    "PROJECT_MANAGER",
    "SALES_EXECUTIVE",
    "DEVELOPER",
    "DESIGNER",
  ]),
});

export const userPatchSchema = z.object({
  role: z
    .enum([
      "SUPER_ADMIN",
      "ADMIN",
      "PROJECT_MANAGER",
      "SALES_EXECUTIVE",
      "DEVELOPER",
      "DESIGNER",
    ])
    .optional(),
  active: z.boolean().optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(8, "New password must be at least 8 characters").max(200),
});

export type LoginInput = z.infer<typeof loginSchema>;
