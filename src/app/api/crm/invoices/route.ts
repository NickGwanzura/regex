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
  resolveCurrency,
  wrap,
} from "@/lib/crm";
import type { DbTx, LineItem } from "@/lib/crm";
import { createInvoice, firstIssue } from "@/lib/validation";
import type { CrmInvoice } from "@/lib/db/schema";

function serializeInvoice(inv: CrmInvoice) {
  return {
    ...inv,
    subtotal: dollars(inv.subtotalCents),
    tax: dollars(inv.taxCents),
    total: dollars(inv.totalCents),
  };
}

// Serializes number allocation per entity: concurrent creates block on a
// Postgres advisory (transaction-scoped) lock, then take MAX(seq)+1, so two
// requests can never pick the same number — even after deletions.
const INVOICE_NUMBER_LOCK = 7302;

async function nextInvoiceNumber(tx: DbTx) {
  const prefix = `INV-${new Date().getFullYear()}-`;
  await tx.execute(sql`SELECT pg_advisory_xact_lock(${INVOICE_NUMBER_LOCK})`);
  const [agg] = await tx
    .select({
      next: sql<number>`COALESCE(MAX(CAST(SUBSTRING(${crmInvoices.number} FROM ${prefix.length + 1}) AS INTEGER)), 0) + 1`,
    })
    .from(crmInvoices)
    .where(like(crmInvoices.number, `${prefix}%`));
  return `${prefix}${String(agg?.next ?? 1).padStart(4, "0")}`;
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
  const parsed = createInvoice.safeParse(body);
  if (!parsed.success) throw new CrmError(400, firstIssue(parsed.error));
  const data = parsed.data;

  const quoteId = data.quoteId;
  let clientId = data.clientId;
  let installationId = data.installationId ?? undefined;
  let taxRate = data.taxRate ?? 0;
  let currency = resolveCurrency(data.currency);
  let items: LineItem[];

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
    currency = quote.currency;
    if (data.items) {
      items = parseItems(data.items);
    } else {
      const quoteItems = await db
        .select()
        .from(crmQuoteItems)
        .where(eq(crmQuoteItems.quoteId, quoteId));
      items = quoteItems.map((i) => ({
        description: i.description,
        qty: i.qty,
        unitPriceCents: i.unitPriceCents,
      }));
    }
  } else {
    items = parseItems(data.items);
  }

  if (!clientId) throw new CrmError(400, "clientId is required");
  if (items.length === 0) {
    throw new CrmError(400, "items must be a non-empty array");
  }

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

  const totals = computeTotals(items, taxRate);
  const status = data.status ?? "draft";
  const issueDate = data.issueDate ? new Date(data.issueDate) : new Date();
  const dueDate = data.dueDate ? new Date(data.dueDate) : null;

  const [invoice] = await db.transaction(async (tx) => {
    const number = await nextInvoiceNumber(tx);
    const [created] = await tx
      .insert(crmInvoices)
      .values({
        number,
        clientId,
        installationId,
        quoteId,
        status,
        taxRate,
        currency,
        ...totals,
        issueDate,
        dueDate,
        notes: data.notes ?? null,
      })
      .returning();
    await tx
      .insert(crmInvoiceItems)
      .values(items.map((i) => ({ invoiceId: created.id, ...i })));
    return [created];
  });

  return ok({ invoice: serializeInvoice(invoice) }, { status: 201 });
});
