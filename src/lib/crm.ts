import "server-only";

import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { eq, sql } from "drizzle-orm";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { crmInvoices, crmPayments } from "@/lib/db/schema";
import type { CrmInvoice } from "@/lib/db/schema";
import { firstIssue, lineItems } from "@/lib/validation";

// Enum string lists now live in lib/validation (the single source of truth)
// and are re-exported here so existing callers importing from "@/lib/crm"
// keep working.
export {
  CLIENT_STATUSES,
  ENGAGEMENT_MODELS,
  INSTALLATION_STATUSES,
  INVOICE_STATUSES,
  QUOTE_STATUSES,
  SERVICE_TYPES,
} from "./validation";

/** The transaction handle passed to db.transaction() callbacks. */
export type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Re-derives an invoice's status from its payments:
 * fully paid -> paid, partially paid -> partial, otherwise back to sent.
 */
export async function recomputeInvoiceStatus(invoiceId: string): Promise<void> {
  const [invoice] = await db
    .select()
    .from(crmInvoices)
    .where(eq(crmInvoices.id, invoiceId))
    .limit(1);
  if (!invoice || invoice.status === "void") return;

  const [agg] = await db
    .select({
      paid: sql<number>`coalesce(sum(${crmPayments.amountCents})::int, 0)`,
    })
    .from(crmPayments)
    .where(eq(crmPayments.invoiceId, invoiceId));
  const paid = agg?.paid ?? 0;

  let status: CrmInvoice["status"] = invoice.status;
  if (invoice.totalCents > 0 && paid >= invoice.totalCents) status = "paid";
  else if (paid > 0) status = "partial";
  else if (invoice.status === "paid" || invoice.status === "partial") {
    status = "sent";
  }

  if (status !== invoice.status) {
    await db
      .update(crmInvoices)
      .set({
        status,
        paidAt: status === "paid" ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(crmInvoices.id, invoiceId));
  }
}

export class CrmError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "CrmError";
  }
}

/** Requires an authenticated admin session; throws a CrmError otherwise. */
export async function requireAdmin() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    throw new CrmError(401, "Not authenticated");
  }
  if (session.user.role !== "admin") {
    throw new CrmError(403, "Admin access required");
  }
  return session.user;
}

export function ok(data: unknown, init?: ResponseInit): NextResponse {
  return NextResponse.json(data, init);
}

export function err(status: number, message: string): NextResponse {
  return NextResponse.json({ error: message }, { status });
}/** Wraps a route handler so thrown CrmErrors become JSON responses. */
export function wrap<F>(fn: F): F {
  return (async (...args: unknown[]): Promise<NextResponse> => {
    try {
      return await (fn as (...a: unknown[]) => Promise<NextResponse>)(...args);
    } catch (e) {
      if (e instanceof CrmError) return err(e.status, e.message);
      console.error("[crm] unhandled error:", e);
      return err(500, "Internal server error");
    }
  }) as F;
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    return (await req.json()) as Record<string, unknown>;
  } catch {
    throw new CrmError(400, "Invalid JSON body");
  }
}

// Money: the API speaks in dollars (floats); storage is integer cents.
export function toCents(dollars: number): number {
  if (!Number.isFinite(dollars)) return 0;
  return Math.round(dollars * 100);
}

export function dollars(cents: number): number {
  return Math.round(cents) / 100;
}


export interface LineItem {
  description: string;
  qty: number;
  unitPriceCents: number;
}

/** Validates a line-items array (API shape: {description, qty, unitPrice}). */
export function parseItems(items: unknown): LineItem[] {
  const parsed = lineItems.safeParse(items);
  if (!parsed.success) throw new CrmError(400, firstIssue(parsed.error));
  return parsed.data.map((i) => ({
    description: i.description,
    qty: i.qty,
    unitPriceCents: toCents(i.unitPrice),
  }));
}

export function serializeItems(items: LineItem[]) {
  return items.map((i) => ({ ...i, unitPrice: dollars(i.unitPriceCents) }));
}

export function computeTotals(
  items: LineItem[],
  taxRate: number,
): { subtotalCents: number; taxCents: number; totalCents: number } {
  const subtotalCents = items.reduce(
    (acc, i) => acc + i.qty * i.unitPriceCents,
    0,
  );
  const taxCents = Math.round((subtotalCents * Math.max(0, taxRate)) / 100);
  return {
    subtotalCents,
    taxCents,
    totalCents: subtotalCents + taxCents,
  };
}

// Derived filter lists for stats (base enums live in lib/validation).
export const ACTIVE_INSTALLATION_STATUSES = [
  "lead",
  "planned",
  "in_progress",
  "on_hold",
] as const;

export const OPEN_QUOTE_STATUSES = ["draft", "sent"] as const;

export const OPEN_INVOICE_STATUSES = ["sent", "partial", "overdue"] as const;

export const NON_VOID_INVOICE_STATUSES = [
  "draft",
  "sent",
  "partial",
  "paid",
  "overdue",
] as const;
