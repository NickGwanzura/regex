import { NextRequest } from "next/server";
import { and, desc, eq, inArray, like, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  crmClients,
  crmInstallations,
  crmInvoiceItems,
  crmInvoices,
  crmPayments,
  crmQuoteItems,
  crmQuotes,
} from "@/lib/db/schema";
import {
  INVOICE_STATUSES,
  CrmError,
  computeTotals,
  dollars,
  ok,
  parseItems,
  readJson,
  requireAdmin,
  taxRateOf,
  wrap,
} from "@/lib/crm";
import type { CrmInvoice } from "@/lib/db/schema";

function serializeInvoice(inv: CrmInvoice) {
  return {
    ...inv,
    subtotal: dollars(inv.subtotalCents),
    tax: dollars(inv.taxCents),
    total: dollars(inv.totalCents),
  };
}

async function nextInvoiceNumber() {
  const year = new Date().getFullYear();
  const prefix = `INV-${year}-`;
  const existing = await db
    .select({ number: crmInvoices.number })
    .from(crmInvoices)
    .where(like(crmInvoices.number, `${prefix}%`));
  return `${prefix}${String(existing.length + 1).padStart(4, "0")}`;
}

export const GET = wrap(async (req: NextRequest) => {
  await requireAdmin();
  const { searchParams } = new URL(req.url);
  const clientId = searchParams.get("clientId");
  const status =
    INVOICE_STATUSES.find((s) => s === searchParams.get("status")) ?? undefined;

  const where = and(
    clientId ? eq(crmInvoices.clientId, clientId) : undefined,
    status ? eq(crmInvoices.status, status) : undefined,
  );

  const rows = await db
    .select({ invoice: crmInvoices, clientName: crmClients.name })
    .from(crmInvoices)
    .innerJoin(crmClients, eq(crmClients.id, crmInvoices.clientId))
    .where(where)
    .orderBy(desc(crmInvoices.dueDate), desc(crmInvoices.createdAt));

  const ids = rows.map((r) => r.invoice.id);
  const paidRows = ids.length
    ? await db
        .select({
          invoiceId: crmPayments.invoiceId,
          paidCents: sql<number>`coalesce(sum(${crmPayments.amountCents})::int, 0)`,
        })
        .from(crmPayments)
        .where(inArray(crmPayments.invoiceId, ids))
        .groupBy(crmPayments.invoiceId)
    : [];
  const paidMap = new Map(paidRows.map((p) => [p.invoiceId, p.paidCents]));

  return ok({
    invoices: rows.map(({ invoice, clientName }) => {
      const paidCents = paidMap.get(invoice.id) ?? 0;
      return {
        ...serializeInvoice(invoice),
        clientName,
        paid: dollars(paidCents),
        balance: dollars(Math.max(0, invoice.totalCents - paidCents)),
      };
    }),
  });
});

export const POST = wrap(async (req: NextRequest) => {
  await requireAdmin();
  const body = await readJson(req);

  const quoteId = typeof body.quoteId === "string" ? body.quoteId : undefined;
  let clientId = typeof body.clientId === "string" ? body.clientId : "";
  let installationId =
    typeof body.installationId === "string" ? body.installationId : undefined;
  let taxRate = taxRateOf(body.taxRate);
  let itemsRaw: unknown = body.items;

  // Invoice created from an accepted quote copies the quote's items + tax.
  if (quoteId) {
    const [quote] = await db
      .select()
      .from(crmQuotes)
      .where(eq(crmQuotes.id, quoteId))
      .limit(1);
    if (!quote) throw new CrmError(400, "Quote not found");
    if (!clientId) clientId = quote.clientId;
    if (!installationId) installationId = quote.installationId ?? undefined;
    taxRate = quote.taxRate;
    if (!Array.isArray(itemsRaw)) {
      const quoteItems = await db
        .select()
        .from(crmQuoteItems)
        .where(eq(crmQuoteItems.quoteId, quoteId));
      itemsRaw = quoteItems.map((i) => ({
        description: i.description,
        qty: i.qty,
        unitPrice: dollars(i.unitPriceCents),
      }));
    }
  }

  if (!clientId) throw new CrmError(400, "clientId is required");
  const [client] = await db
    .select({ id: crmClients.id })
    .from(crmClients)
    .where(eq(crmClients.id, clientId))
    .limit(1);
  if (!client) throw new CrmError(400, "Client not found");

  if (installationId) {
    const [installation] = await db
      .select({ id: crmInstallations.id })
      .from(crmInstallations)
      .where(eq(crmInstallations.id, installationId))
      .limit(1);
    if (!installation) throw new CrmError(400, "Installation not found");
  }

  const items = parseItems(itemsRaw);
  const totals = computeTotals(items, taxRate);
  const status = INVOICE_STATUSES.find((s) => s === body.status) ?? "draft";
  const number = await nextInvoiceNumber();
  const issueDate =
    typeof body.issueDate === "string" && body.issueDate
      ? new Date(body.issueDate)
      : new Date();
  const dueDate =
    typeof body.dueDate === "string" && body.dueDate
      ? new Date(body.dueDate)
      : null;

  const [invoice] = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(crmInvoices)
      .values({
        number,
        clientId,
        installationId,
        quoteId,
        status,
        taxRate,
        ...totals,
        issueDate,
        dueDate,
        notes: typeof body.notes === "string" ? body.notes : null,
      })
      .returning();
    await tx
      .insert(crmInvoiceItems)
      .values(items.map((i) => ({ invoiceId: created.id, ...i })));
    return [created];
  });

  return ok({ invoice: serializeInvoice(invoice) }, { status: 201 });
});
