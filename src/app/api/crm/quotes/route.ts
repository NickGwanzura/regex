import { NextRequest } from "next/server";
import { and, desc, eq, like, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  crmClients,
  crmInstallations,
  crmQuoteItems,
  crmQuotes,
} from "@/lib/db/schema";
import {
  QUOTE_STATUSES,
  CrmError,
  computeTotals,
  dollars,
  ok,
  parseItems,
  readJson,
  requireAdmin,
  wrap,
} from "@/lib/crm";
import type { DbTx } from "@/lib/crm";
import { createQuote, firstIssue } from "@/lib/validation";
import type { CrmQuote } from "@/lib/db/schema";

function serializeQuote(q: CrmQuote) {
  return {
    ...q,
    subtotal: dollars(q.subtotalCents),
    tax: dollars(q.taxCents),
    total: dollars(q.totalCents),
  };
}

// Serializes number allocation per entity: concurrent creates block on a
// Postgres advisory (transaction-scoped) lock, then take MAX(seq)+1, so two
// requests can never pick the same number — even after deletions.
const QUOTE_NUMBER_LOCK = 7301;

async function nextQuoteNumber(tx: DbTx) {
  const prefix = `Q-${new Date().getFullYear()}-`;
  await tx.execute(sql`SELECT pg_advisory_xact_lock(${QUOTE_NUMBER_LOCK})`);
  const [agg] = await tx
    .select({
      next: sql<number>`COALESCE(MAX(CAST(SUBSTRING(${crmQuotes.number} FROM ${prefix.length + 1}) AS INTEGER)), 0) + 1`,
    })
    .from(crmQuotes)
    .where(like(crmQuotes.number, `${prefix}%`));
  return `${prefix}${String(agg?.next ?? 1).padStart(4, "0")}`;
}

export const GET = wrap(async (req: NextRequest) => {
  await requireAdmin();
  const { searchParams } = new URL(req.url);
  const clientId = searchParams.get("clientId");
  const status =
    QUOTE_STATUSES.find((s) => s === searchParams.get("status")) ?? undefined;

  const where = and(
    clientId ? eq(crmQuotes.clientId, clientId) : undefined,
    status ? eq(crmQuotes.status, status) : undefined,
  );

  const rows = await db
    .select({ quote: crmQuotes, clientName: crmClients.name })
    .from(crmQuotes)
    .innerJoin(crmClients, eq(crmClients.id, crmQuotes.clientId))
    .where(where)
    .orderBy(desc(crmQuotes.createdAt));

  return ok({
    quotes: rows.map(({ quote, clientName }) => ({
      ...serializeQuote(quote),
      clientName,
    })),
  });
});

export const POST = wrap(async (req: NextRequest) => {
  await requireAdmin();
  const body = await readJson(req);
  const parsed = createQuote.safeParse(body);
  if (!parsed.success) throw new CrmError(400, firstIssue(parsed.error));
  const data = parsed.data;

  const [client] = await db
    .select({ id: crmClients.id })
    .from(crmClients)
    .where(eq(crmClients.id, data.clientId))
    .limit(1);
  if (!client) throw new CrmError(400, "Client not found");

  let installationId: string | null = null;
  if (data.installationId) {
    const [installation] = await db
      .select({ id: crmInstallations.id })
      .from(crmInstallations)
      .where(eq(crmInstallations.id, data.installationId))
      .limit(1);
    if (!installation) throw new CrmError(400, "Installation not found");
    installationId = data.installationId;
  }

  const items = parseItems(data.items);
  const taxRate = data.taxRate ?? 0;
  const totals = computeTotals(items, taxRate);
  const status = data.status ?? "draft";

  const [quote] = await db.transaction(async (tx) => {
    const number = await nextQuoteNumber(tx);
    const [created] = await tx
      .insert(crmQuotes)
      .values({
        number,
        clientId: data.clientId,
        installationId,
        title: data.title ?? null,
        status,
        taxRate,
        ...totals,
        validUntil: data.validUntil ? new Date(data.validUntil) : null,
        notes: data.notes ?? null,
      })
      .returning();
    await tx
      .insert(crmQuoteItems)
      .values(items.map((i) => ({ quoteId: created.id, ...i })));
    return [created];
  });

  return ok({ quote: serializeQuote(quote) }, { status: 201 });
});
