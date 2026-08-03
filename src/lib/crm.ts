import "server-only";

import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { eq, sql } from "drizzle-orm";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { crmInvoices, crmPayments } from "@/lib/db/schema";
import type {
  CrmClient,
  CrmInstallation,
  CrmInvoice,
  CrmQuote,
} from "@/lib/db/schema";

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

export function taxRateOf(value: unknown): number {
  const n = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return Math.min(100, Math.max(0, Math.round(n * 100) / 100));
}

export interface LineItem {
  description: string;
  qty: number;
  unitPriceCents: number;
}

/** Validates a line-items array (API shape: {description, qty, unitPrice}). */
export function parseItems(items: unknown): LineItem[] {
  if (!Array.isArray(items) || items.length === 0) {
    throw new CrmError(400, "items must be a non-empty array");
  }
  return items.map((raw) => {
    const it = (raw ?? {}) as Record<string, unknown>;
    const description =
      typeof it.description === "string" ? it.description.trim() : "";
    if (!description) {
      throw new CrmError(400, "each item requires a description");
    }
    const qty =
      typeof it.qty === "number" && it.qty > 0 ? Math.round(it.qty) : 1;
    const unitPrice = typeof it.unitPrice === "number" ? it.unitPrice : 0;
    return { description, qty, unitPriceCents: toCents(unitPrice) };
  });
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

// Typed enum arrays for filtering / validation.
export const CLIENT_STATUSES: Array<CrmClient["status"]> = [
  "lead",
  "active",
  "inactive",
];

export const INSTALLATION_STATUSES: Array<CrmInstallation["status"]> = [
  "lead",
  "planned",
  "in_progress",
  "on_hold",
  "completed",
  "cancelled",
];

export const ACTIVE_INSTALLATION_STATUSES: Array<CrmInstallation["status"]> = [
  "lead",
  "planned",
  "in_progress",
  "on_hold",
];

export const SERVICE_TYPES: Array<CrmInstallation["serviceType"]> = [
  "wireless_rf",
  "structured_cabling",
  "firewall_security",
  "managed_support",
  "vpn",
];

export const ENGAGEMENT_MODELS: Array<CrmInstallation["engagementModel"]> = [
  "build",
  "repair",
  "operate",
];

export const QUOTE_STATUSES: Array<CrmQuote["status"]> = [
  "draft",
  "sent",
  "accepted",
  "declined",
  "expired",
];

export const OPEN_QUOTE_STATUSES: Array<CrmQuote["status"]> = [
  "draft",
  "sent",
];

export const INVOICE_STATUSES: Array<CrmInvoice["status"]> = [
  "draft",
  "sent",
  "partial",
  "paid",
  "overdue",
  "void",
];

export const OPEN_INVOICE_STATUSES: Array<CrmInvoice["status"]> = [
  "sent",
  "partial",
  "overdue",
];

export const NON_VOID_INVOICE_STATUSES: Array<CrmInvoice["status"]> = [
  "draft",
  "sent",
  "partial",
  "paid",
  "overdue",
];
