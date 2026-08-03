CREATE TYPE "public"."client_status" AS ENUM('lead', 'active', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."engagement_model" AS ENUM('build', 'repair', 'operate');--> statement-breakpoint
CREATE TYPE "public"."installation_status" AS ENUM('lead', 'planned', 'in_progress', 'on_hold', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('draft', 'sent', 'partial', 'paid', 'overdue', 'void');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('bank_transfer', 'card', 'cash', 'cheque', 'other');--> statement-breakpoint
CREATE TYPE "public"."quote_status" AS ENUM('draft', 'sent', 'accepted', 'declined', 'expired');--> statement-breakpoint
CREATE TYPE "public"."record_kind" AS ENUM('monthly_support', 'health_check', 'site_visit', 'remote_support', 'report');--> statement-breakpoint
CREATE TYPE "public"."record_status" AS ENUM('scheduled', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."service_type" AS ENUM('wireless_rf', 'structured_cabling', 'firewall_security', 'managed_support', 'vpn');--> statement-breakpoint
CREATE TABLE "crm_clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"industry" text,
	"billingEmail" text,
	"billingPhone" text,
	"billingAddress" text,
	"website" text,
	"status" "client_status" DEFAULT 'lead' NOT NULL,
	"notes" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clientId" uuid NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"role" text,
	"isPrimary" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_installations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clientId" uuid NOT NULL,
	"name" text NOT NULL,
	"serviceType" "service_type" NOT NULL,
	"engagementModel" "engagement_model" NOT NULL,
	"status" "installation_status" DEFAULT 'lead' NOT NULL,
	"siteAddress" text,
	"startDate" timestamp,
	"endDate" timestamp,
	"valueCents" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_invoice_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoiceId" uuid NOT NULL,
	"description" text NOT NULL,
	"qty" integer DEFAULT 1 NOT NULL,
	"unitPriceCents" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text NOT NULL,
	"clientId" uuid NOT NULL,
	"installationId" uuid,
	"quoteId" uuid,
	"status" "invoice_status" DEFAULT 'draft' NOT NULL,
	"taxRate" integer DEFAULT 0 NOT NULL,
	"subtotalCents" integer DEFAULT 0 NOT NULL,
	"taxCents" integer DEFAULT 0 NOT NULL,
	"totalCents" integer DEFAULT 0 NOT NULL,
	"issueDate" timestamp DEFAULT now() NOT NULL,
	"dueDate" timestamp,
	"paidAt" timestamp,
	"notes" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "crm_invoices_number_unique" UNIQUE("number")
);
--> statement-breakpoint
CREATE TABLE "crm_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoiceId" uuid NOT NULL,
	"amountCents" integer NOT NULL,
	"method" "payment_method" DEFAULT 'bank_transfer' NOT NULL,
	"reference" text,
	"paidAt" timestamp DEFAULT now() NOT NULL,
	"notes" text,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_quote_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quoteId" uuid NOT NULL,
	"description" text NOT NULL,
	"qty" integer DEFAULT 1 NOT NULL,
	"unitPriceCents" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_quotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text NOT NULL,
	"clientId" uuid NOT NULL,
	"installationId" uuid,
	"title" text,
	"status" "quote_status" DEFAULT 'draft' NOT NULL,
	"taxRate" integer DEFAULT 0 NOT NULL,
	"subtotalCents" integer DEFAULT 0 NOT NULL,
	"taxCents" integer DEFAULT 0 NOT NULL,
	"totalCents" integer DEFAULT 0 NOT NULL,
	"validUntil" timestamp,
	"notes" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "crm_quotes_number_unique" UNIQUE("number")
);
--> statement-breakpoint
CREATE TABLE "crm_service_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clientId" uuid NOT NULL,
	"installationId" uuid,
	"kind" "record_kind" DEFAULT 'site_visit' NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"serviceDate" timestamp NOT NULL,
	"durationMinutes" integer,
	"costCents" integer DEFAULT 0 NOT NULL,
	"status" "record_status" DEFAULT 'scheduled' NOT NULL,
	"notes" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "crm_contacts" ADD CONSTRAINT "crm_contacts_clientId_crm_clients_id_fk" FOREIGN KEY ("clientId") REFERENCES "public"."crm_clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_installations" ADD CONSTRAINT "crm_installations_clientId_crm_clients_id_fk" FOREIGN KEY ("clientId") REFERENCES "public"."crm_clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_invoice_items" ADD CONSTRAINT "crm_invoice_items_invoiceId_crm_invoices_id_fk" FOREIGN KEY ("invoiceId") REFERENCES "public"."crm_invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_invoices" ADD CONSTRAINT "crm_invoices_clientId_crm_clients_id_fk" FOREIGN KEY ("clientId") REFERENCES "public"."crm_clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_invoices" ADD CONSTRAINT "crm_invoices_installationId_crm_installations_id_fk" FOREIGN KEY ("installationId") REFERENCES "public"."crm_installations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_invoices" ADD CONSTRAINT "crm_invoices_quoteId_crm_quotes_id_fk" FOREIGN KEY ("quoteId") REFERENCES "public"."crm_quotes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_payments" ADD CONSTRAINT "crm_payments_invoiceId_crm_invoices_id_fk" FOREIGN KEY ("invoiceId") REFERENCES "public"."crm_invoices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_quote_items" ADD CONSTRAINT "crm_quote_items_quoteId_crm_quotes_id_fk" FOREIGN KEY ("quoteId") REFERENCES "public"."crm_quotes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_quotes" ADD CONSTRAINT "crm_quotes_clientId_crm_clients_id_fk" FOREIGN KEY ("clientId") REFERENCES "public"."crm_clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_quotes" ADD CONSTRAINT "crm_quotes_installationId_crm_installations_id_fk" FOREIGN KEY ("installationId") REFERENCES "public"."crm_installations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_service_records" ADD CONSTRAINT "crm_service_records_clientId_crm_clients_id_fk" FOREIGN KEY ("clientId") REFERENCES "public"."crm_clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_service_records" ADD CONSTRAINT "crm_service_records_installationId_crm_installations_id_fk" FOREIGN KEY ("installationId") REFERENCES "public"."crm_installations"("id") ON DELETE set null ON UPDATE no action;