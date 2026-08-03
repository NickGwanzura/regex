import {
  boolean,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("emailVerified").notNull(),
  image: text("image"),
  role: text("role").default("user").notNull(),
  createdAt: timestamp("createdAt").notNull(),
  updatedAt: timestamp("updatedAt").notNull(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expiresAt").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("createdAt").notNull(),
  updatedAt: timestamp("updatedAt").notNull(),
  ipAddress: text("ipAddress"),
  userAgent: text("userAgent"),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("accountId").notNull(),
  providerId: text("providerId").notNull(),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  idToken: text("idToken"),
  accessTokenExpiresAt: timestamp("accessTokenExpiresAt"),
  refreshTokenExpiresAt: timestamp("refreshTokenExpiresAt"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("createdAt").notNull(),
  updatedAt: timestamp("updatedAt").notNull(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt"),
  updatedAt: timestamp("updatedAt"),
});

export type User = typeof user.$inferSelect;
export type Session = typeof session.$inferSelect;
export type Account = typeof account.$inferSelect;

// ---------------------------------------------------------------------------
// CRM
// ---------------------------------------------------------------------------
// Money is stored as integer cents to keep arithmetic exact.

export const serviceTypeEnum = pgEnum("service_type", [
  "wireless_rf",
  "structured_cabling",
  "firewall_security",
  "managed_support",
  "vpn",
]);

export const engagementModelEnum = pgEnum("engagement_model", [
  "build",
  "repair",
  "operate",
]);

export const clientStatusEnum = pgEnum("client_status", [
  "lead",
  "active",
  "inactive",
]);

export const installationStatusEnum = pgEnum("installation_status", [
  "lead",
  "planned",
  "in_progress",
  "on_hold",
  "completed",
  "cancelled",
]);

export const quoteStatusEnum = pgEnum("quote_status", [
  "draft",
  "sent",
  "accepted",
  "declined",
  "expired",
]);

export const invoiceStatusEnum = pgEnum("invoice_status", [
  "draft",
  "sent",
  "partial",
  "paid",
  "overdue",
  "void",
]);

export const paymentMethodEnum = pgEnum("payment_method", [
  "bank_transfer",
  "card",
  "cash",
  "cheque",
  "other",
]);

export const recordKindEnum = pgEnum("record_kind", [
  "monthly_support",
  "health_check",
  "site_visit",
  "remote_support",
  "report",
]);

export const recordStatusEnum = pgEnum("record_status", [
  "scheduled",
  "completed",
  "cancelled",
]);

// ---- Clients ----

export const crmClients = pgTable("crm_clients", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  industry: text("industry"),
  billingEmail: text("billingEmail"),
  billingPhone: text("billingPhone"),
  billingAddress: text("billingAddress"),
  website: text("website"),
  status: clientStatusEnum("status").default("lead").notNull(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export const crmContacts = pgTable("crm_contacts", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("clientId")
    .notNull()
    .references(() => crmClients.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  role: text("role"),
  isPrimary: boolean("isPrimary").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export const crmInstallations = pgTable("crm_installations", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("clientId")
    .notNull()
    .references(() => crmClients.id, { onDelete: "restrict" }),
  name: text("name").notNull(),
  serviceType: serviceTypeEnum("serviceType").notNull(),
  engagementModel: engagementModelEnum("engagementModel").notNull(),
  status: installationStatusEnum("status").default("lead").notNull(),
  siteAddress: text("siteAddress"),
  startDate: timestamp("startDate"),
  endDate: timestamp("endDate"),
  valueCents: integer("valueCents").default(0).notNull(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

// ---- Quotes / estimates ----

export const crmQuotes = pgTable("crm_quotes", {
  id: uuid("id").primaryKey().defaultRandom(),
  number: text("number").notNull().unique(),
  clientId: uuid("clientId")
    .notNull()
    .references(() => crmClients.id, { onDelete: "restrict" }),
  installationId: uuid("installationId").references(
    () => crmInstallations.id,
    { onDelete: "set null" },
  ),
  title: text("title"),
  status: quoteStatusEnum("status").default("draft").notNull(),
  taxRate: integer("taxRate").default(0).notNull(),
  subtotalCents: integer("subtotalCents").default(0).notNull(),
  taxCents: integer("taxCents").default(0).notNull(),
  totalCents: integer("totalCents").default(0).notNull(),
  validUntil: timestamp("validUntil"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export const crmQuoteItems = pgTable("crm_quote_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  quoteId: uuid("quoteId")
    .notNull()
    .references(() => crmQuotes.id, { onDelete: "cascade" }),
  description: text("description").notNull(),
  qty: integer("qty").default(1).notNull(),
  unitPriceCents: integer("unitPriceCents").default(0).notNull(),
});

// ---- Invoices & payments ----

export const crmInvoices = pgTable("crm_invoices", {
  id: uuid("id").primaryKey().defaultRandom(),
  number: text("number").notNull().unique(),
  clientId: uuid("clientId")
    .notNull()
    .references(() => crmClients.id, { onDelete: "restrict" }),
  installationId: uuid("installationId").references(
    () => crmInstallations.id,
    { onDelete: "set null" },
  ),
  quoteId: uuid("quoteId").references(() => crmQuotes.id, {
    onDelete: "set null",
  }),
  status: invoiceStatusEnum("status").default("draft").notNull(),
  taxRate: integer("taxRate").default(0).notNull(),
  subtotalCents: integer("subtotalCents").default(0).notNull(),
  taxCents: integer("taxCents").default(0).notNull(),
  totalCents: integer("totalCents").default(0).notNull(),
  issueDate: timestamp("issueDate").defaultNow().notNull(),
  dueDate: timestamp("dueDate"),
  paidAt: timestamp("paidAt"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export const crmInvoiceItems = pgTable("crm_invoice_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  invoiceId: uuid("invoiceId")
    .notNull()
    .references(() => crmInvoices.id, { onDelete: "cascade" }),
  description: text("description").notNull(),
  qty: integer("qty").default(1).notNull(),
  unitPriceCents: integer("unitPriceCents").default(0).notNull(),
});

export const crmPayments = pgTable("crm_payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  invoiceId: uuid("invoiceId")
    .notNull()
    .references(() => crmInvoices.id, { onDelete: "restrict" }),
  amountCents: integer("amountCents").notNull(),
  method: paymentMethodEnum("method").default("bank_transfer").notNull(),
  reference: text("reference"),
  paidAt: timestamp("paidAt").defaultNow().notNull(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ---- Managed service records ----

export const crmServiceRecords = pgTable("crm_service_records", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("clientId")
    .notNull()
    .references(() => crmClients.id, { onDelete: "restrict" }),
  installationId: uuid("installationId").references(
    () => crmInstallations.id,
    { onDelete: "set null" },
  ),
  kind: recordKindEnum("kind").default("site_visit").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  serviceDate: timestamp("serviceDate").notNull(),
  durationMinutes: integer("durationMinutes"),
  costCents: integer("costCents").default(0).notNull(),
  status: recordStatusEnum("status").default("scheduled").notNull(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type CrmClient = typeof crmClients.$inferSelect;
export type CrmContact = typeof crmContacts.$inferSelect;
export type CrmInstallation = typeof crmInstallations.$inferSelect;
export type CrmQuote = typeof crmQuotes.$inferSelect;
export type CrmQuoteItem = typeof crmQuoteItems.$inferSelect;
export type CrmInvoice = typeof crmInvoices.$inferSelect;
export type CrmInvoiceItem = typeof crmInvoiceItems.$inferSelect;
export type CrmPayment = typeof crmPayments.$inferSelect;
export type CrmServiceRecord = typeof crmServiceRecords.$inferSelect;
