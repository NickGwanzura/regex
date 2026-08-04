import { and, eq, gte, inArray, lt, lte, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  crmClients,
  crmInstallations,
  crmInvoices,
  crmPayments,
  crmQuotes,
  crmServiceRecords,
} from "@/lib/db/schema";
import {
  ACTIVE_INSTALLATION_STATUSES,
  NON_VOID_INVOICE_STATUSES,
  OPEN_INVOICE_STATUSES,
  OPEN_QUOTE_STATUSES,
  dollars,
  ok,
  requireAdmin,
  wrap,
} from "@/lib/crm";

export const GET = wrap(async () => {
  await requireAdmin();

  const now = new Date();
  const inThirtyDays = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  const [clients] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(crmClients);

  const [activeInstallations] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(crmInstallations)
    .where(inArray(crmInstallations.status, ACTIVE_INSTALLATION_STATUSES));

  const [openQuotes] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(crmQuotes)
    .where(inArray(crmQuotes.status, OPEN_QUOTE_STATUSES));

  // Money totals are kept per currency — USD and ZWL ledgers stay separate.
  const billed = await db
    .select({
      currency: crmInvoices.currency,
      totalCents: sql<number>`coalesce(sum(${crmInvoices.totalCents})::int, 0)`,
    })
    .from(crmInvoices)
    .where(inArray(crmInvoices.status, NON_VOID_INVOICE_STATUSES))
    .groupBy(crmInvoices.currency);

  const collected = await db
    .select({
      currency: crmPayments.currency,
      totalCents: sql<number>`coalesce(sum(${crmPayments.amountCents})::int, 0)`,
    })
    .from(crmPayments)
    .groupBy(crmPayments.currency);

  const overdueInvoices = await db
    .select({
      id: crmInvoices.id,
      totalCents: crmInvoices.totalCents,
      currency: crmInvoices.currency,
    })
    .from(crmInvoices)
    .where(
      and(
        inArray(crmInvoices.status, OPEN_INVOICE_STATUSES),
        lt(crmInvoices.dueDate, now),
      ),
    );

  const overdueIds = overdueInvoices.map((i) => i.id);
  const overduePayments = overdueIds.length
    ? await db
        .select({
          invoiceId: crmPayments.invoiceId,
          currency: crmPayments.currency,
          paidCents: sql<number>`coalesce(sum(${crmPayments.amountCents})::int, 0)`,
        })
        .from(crmPayments)
        .where(inArray(crmPayments.invoiceId, overdueIds))
        .groupBy(crmPayments.invoiceId, crmPayments.currency)
    : [];
  const paidByInvoice = new Map(overduePayments.map((p) => [p.invoiceId, p.paidCents]));

  const base = (arr: { currency: string; totalCents: number }[]) => {
    const m = { USD: 0, ZWL: 0 } as Record<string, number>;
    for (const row of arr) m[row.currency] = (m[row.currency] ?? 0) + row.totalCents;
    return m;
  };

  const billedMap = base(billed);
  const collectedMap = base(collected);

  const overdueMap = { USD: 0, ZWL: 0 } as Record<string, number>;
  for (const i of overdueInvoices) {
    overdueMap[i.currency] =
      (overdueMap[i.currency] ?? 0) +
      Math.max(0, i.totalCents - (paidByInvoice.get(i.id) ?? 0));
  }

  const [upcomingRecords] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(crmServiceRecords)
    .where(
      and(
        eq(crmServiceRecords.status, "scheduled"),
        gte(crmServiceRecords.serviceDate, now),
        lte(crmServiceRecords.serviceDate, inThirtyDays),
      ),
    );

  const ledger = (c: "USD" | "ZWL") => {
    const billedCents = billedMap[c];
    const collectedCents = collectedMap[c];
    const outstandingCents = Math.max(0, billedCents - collectedCents);
    return {
      billed: dollars(billedCents),
      collected: dollars(collectedCents),
      outstanding: dollars(outstandingCents),
      overdue: dollars(overdueMap[c] ?? 0),
    };
  };

  const usd = ledger("USD");
  const zwl = ledger("ZWL");

  return ok({
    stats: {
      clients: clients?.n ?? 0,
      activeInstallations: activeInstallations?.n ?? 0,
      openQuotes: openQuotes?.n ?? 0,
      usd,
      zwl,
      // Backwards-compatible single-currency fields (USD) for any existing callers.
      billedTotal: usd.billed,
      collectedTotal: usd.collected,
      outstandingTotal: usd.outstanding,
      overdueTotal: usd.overdue,
      overdueInvoiceCount: overdueInvoices.length,
      upcomingServiceRecords: upcomingRecords?.n ?? 0,
    },
  });
});
