CREATE TYPE "public"."currency" AS ENUM('USD', 'ZWL');--> statement-breakpoint
CREATE TYPE "public"."expense_category" AS ENUM('hardware', 'labour', 'software', 'travel', 'permits', 'other');--> statement-breakpoint
CREATE TABLE "crm_expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clientId" uuid NOT NULL,
	"installationId" uuid,
	"category" "expense_category" DEFAULT 'other' NOT NULL,
	"currency" "currency" DEFAULT 'USD' NOT NULL,
	"amountCents" integer NOT NULL,
	"date" timestamp NOT NULL,
	"description" text NOT NULL,
	"notes" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "crm_installations" ADD COLUMN "currency" "currency" DEFAULT 'USD' NOT NULL;--> statement-breakpoint
ALTER TABLE "crm_invoices" ADD COLUMN "currency" "currency" DEFAULT 'USD' NOT NULL;--> statement-breakpoint
ALTER TABLE "crm_payments" ADD COLUMN "currency" "currency" DEFAULT 'USD' NOT NULL;--> statement-breakpoint
ALTER TABLE "crm_quotes" ADD COLUMN "currency" "currency" DEFAULT 'USD' NOT NULL;--> statement-breakpoint
ALTER TABLE "crm_service_records" ADD COLUMN "currency" "currency" DEFAULT 'USD' NOT NULL;--> statement-breakpoint
ALTER TABLE "crm_expenses" ADD CONSTRAINT "crm_expenses_clientId_crm_clients_id_fk" FOREIGN KEY ("clientId") REFERENCES "public"."crm_clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_expenses" ADD CONSTRAINT "crm_expenses_installationId_crm_installations_id_fk" FOREIGN KEY ("installationId") REFERENCES "public"."crm_installations"("id") ON DELETE set null ON UPDATE no action;