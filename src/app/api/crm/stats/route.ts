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

  const [billed] = await db
    .select({
      totalCents: sql<number>`coalesce(sum(${crmInvoices.totalCents})::int, 0)`,
    })
    .from(crmInvoices)
    .where(inArray(crmInvoices.status, NON_VOID_INVOICE_STATUSES));

  const [collected] = await db
    .select({
      totalCents: sql<number>`coalesce(sum(${crmPayments.amountCents})::int, 0)`,
    })
    .from(crmPayments);

  const overdueInvoices = await db
    .select({ id: crmInvoices.id, totalCents: crmInvoices.totalCents })
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
          paidCents: sql<number>`coalesce(sum(${crmPayments.amountCents})::int, 0)`,
        })
        .from(crmPayments)
        .where(inArray(crmPayments.invoiceId, overdueIds))
        .groupBy(crmPayments.invoiceId)
    : [];
  const paidByInvoice = new Map(overduePayments.map((p) => [p.invoiceId, p.paidCents]));
  const overdueCents = overdueInvoices.reduce(
    (acc, i) => acc + Math.max(0, i.totalCents - (paidByInvoice.get(i.id) ?? 0)),
    0,
  );

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

  const billedCents = billed?.totalCents ?? 0;
  const collectedCents = collected?.totalCents ?? 0;

  return ok({
    stats: {
      clients: clients?.n ?? 0,
      activeInstallations: activeInstallations?.n ?? 0,
      openQuotes: openQuotes?.n ?? 0,
      billedTotal: dollars(billedCents),
      collectedTotal: dollars(collectedCents),
      outstandingTotal: dollars(Math.max(0, billedCents - collectedCents)),
      overdueTotal: dollars(overdueCents),
      overdueInvoiceCount: overdueInvoices.length,
      upcomingServiceRecords: upcomingRecords?.n ?? 0,
    },
  });
});
