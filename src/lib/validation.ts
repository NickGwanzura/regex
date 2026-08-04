import { z } from "zod";

// ---------------------------------------------------------------------------
// Shared Zod schemas for CRM request bodies. Money fields are in dollars (the
// API speaks dollars; storage is integer cents). No schema uses `.default()`:
// routes handle defaults so `.partial()` (PATCH) keeps "was this key sent?"
// semantics.
// ---------------------------------------------------------------------------

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("a valid email address is required")
  .max(254);

/** Optional free-text field: string | null | undefined. */
export const optionalText = z.string().max(2000).nullable().optional();

/** Optional email-ish field: accepts "", a valid email, null or undefined. */
export const optionalEmail = z
  .string()
  .trim()
  .max(254)
  .refine(
    (s) => s === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s),
    "a valid email address is required",
  )
  .nullable()
  .optional();

/** ISO date string that actually parses to a date. */
export const dateString = z
  .string()
  .refine((s) => !Number.isNaN(Date.parse(s)), "a valid ISO date is required");

/**
 * Optional date: a valid ISO string, "" (meaning "not set"), null or
 * undefined. Routes map ""/null to null or the default date.
 */
export const optionalDate = dateString.or(z.literal("")).nullable().optional();

/** Money in dollars; non-negative. */
export const dollars = z.number().finite().nonnegative();

export const uuid = z.string().uuid("a valid id is required");

export const taxRate = z.number().min(0).max(100).nullable().optional();

// ------------------------------ enums -------------------------------------
// Single source of truth for status/type strings, shared by zod enums and the
// GET query filters (re-exported from lib/crm for backwards compatibility).

export const CLIENT_STATUSES = [
  "lead",
  "active",
  "inactive",
] as const;

export const INSTALLATION_STATUSES = [
  "lead",
  "planned",
  "in_progress",
  "on_hold",
  "completed",
  "cancelled",
] as const;

export const QUOTE_STATUSES = [
  "draft",
  "sent",
  "accepted",
  "declined",
  "expired",
] as const;

export const INVOICE_STATUSES = [
  "draft",
  "sent",
  "partial",
  "paid",
  "overdue",
  "void",
] as const;

export const SERVICE_TYPES = [
  "wireless_rf",
  "structured_cabling",
  "firewall_security",
  "managed_support",
  "vpn",
] as const;

export const ENGAGEMENT_MODELS = ["build", "repair", "operate"] as const;

export const PAYMENT_METHODS = [
  "bank_transfer",
  "card",
  "cash",
  "cheque",
  "other",
] as const;

export const RECORD_KINDS = [
  "monthly_support",
  "health_check",
  "site_visit",
  "remote_support",
  "report",
] as const;

export const RECORD_STATUSES = ["scheduled", "completed", "cancelled"] as const;

export const INVITE_ROLES = ["user", "admin"] as const;

export const clientStatus = z.enum(CLIENT_STATUSES);
export const installationStatus = z.enum(INSTALLATION_STATUSES);
export const quoteStatus = z.enum(QUOTE_STATUSES);
export const invoiceStatus = z.enum(INVOICE_STATUSES);
export const serviceType = z.enum(SERVICE_TYPES);
export const engagementModel = z.enum(ENGAGEMENT_MODELS);
export const paymentMethod = z.enum(PAYMENT_METHODS);
export const recordKind = z.enum(RECORD_KINDS);
export const recordStatus = z.enum(RECORD_STATUSES);
export const inviteRole = z.enum(INVITE_ROLES);

// ------------------------------ line items --------------------------------

export const lineItem = z.object({
  description: z
    .string()
    .trim()
    .min(1, "each item requires a description")
    .max(500),
  qty: z.number().int().positive().default(1),
  unitPrice: dollars.default(0),
});

export const lineItems = z.array(lineItem).min(1, "items must be a non-empty array");
export const optionalLineItems = z.array(lineItem).min(1).optional();

// ------------------------------ entities ----------------------------------

export const createClient = z.object({
  name: z.string().trim().min(1, "name is required").max(200),
  industry: optionalText,
  billingEmail: optionalEmail,
  billingPhone: optionalText,
  billingAddress: optionalText,
  website: optionalText,
  status: clientStatus.optional(),
  notes: z.string().max(5000).nullable().optional(),
});
export const updateClient = createClient.partial();

export const createContact = z.object({
  clientId: uuid,
  name: z.string().trim().min(1, "name is required").max(200),
  email: optionalEmail,
  phone: optionalText,
  role: optionalText,
  isPrimary: z.boolean().optional(),
});
export const updateContact = createContact.partial();

export const createInstallation = z.object({
  clientId: uuid,
  name: z.string().trim().min(1, "name is required").max(300),
  serviceType,
  engagementModel,
  status: installationStatus.optional(),
  siteAddress: optionalText,
  startDate: optionalDate,
  endDate: optionalDate,
  value: dollars.nullable().optional(),
  notes: optionalText,
});
export const updateInstallation = createInstallation.partial();

export const createQuote = z.object({
  clientId: uuid,
  installationId: uuid.nullable().optional(),
  title: z.string().max(500).nullable().optional(),
  status: quoteStatus.optional(),
  taxRate,
  items: lineItems,
  validUntil: optionalDate,
  notes: optionalText,
});
export const updateQuote = createQuote.partial();

export const createInvoice = z.object({
  clientId: uuid.optional(),
  installationId: uuid.nullable().optional(),
  quoteId: uuid.optional(),
  status: invoiceStatus.optional(),
  taxRate,
  items: optionalLineItems,
  issueDate: optionalDate,
  dueDate: optionalDate,
  notes: optionalText,
});
export const updateInvoice = createInvoice.partial();

export const createPayment = z.object({
  invoiceId: uuid,
  amount: z.number().positive("amount must be a positive number"),
  method: paymentMethod.optional(),
  reference: optionalText,
  paidAt: optionalDate,
  notes: optionalText,
});

export const createServiceRecord = z.object({
  clientId: uuid,
  installationId: uuid.nullable().optional(),
  kind: recordKind.optional(),
  title: z.string().trim().min(1, "title is required").max(500),
  description: optionalText,
  serviceDate: dateString,
  durationMinutes: z.number().int().nonnegative().nullable().optional(),
  durationHours: z.number().positive().nullable().optional(),
  cost: dollars.nullable().optional(),
  status: recordStatus.optional(),
  notes: optionalText,
});
export const updateServiceRecord = createServiceRecord.partial();

export const createInvite = z.object({
  email: emailSchema,
  role: inviteRole.optional(),
  expiresInDays: z.number().int().min(1).max(90).optional(),
});

// ------------------------------ helpers -----------------------------------

/** First validation issue as a single human-readable message. */
export function firstIssue(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "Invalid request";
  const path = issue.path.length ? `${issue.path.join(".")}: ` : "";
  const message = issue.message === "Required" ? "is required" : issue.message;
  return `${path}${message}`;
}
