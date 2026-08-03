import { NextRequest } from "next/server";
import { and, desc, eq, like } from "drizzle-orm";

import { db } from "@/lib/db";
import { crmClients, crmInstallations, crmQuoteItems, crmQuotes } from "@/lib/db/schema";
import {
  QUOTE_STATUSES,
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
import type { CrmQuote } from "@/lib/db/schema";

function serializeQuote(q: CrmQuote) {
  return {
    ...q,
    subtotal: dollars(q.subtotalCents),
    tax: dollars(q.taxCents),
    total: dollars(q.totalCents),
  };
}

async function nextQuoteNumber() {
  const year = new Date().getFullYear();
  const prefix = `Q-${year}-`;
  const existing = await db
    .select({ number: crmQuotes.number })
    .from(crmQuotes)
    .where(like(crmQuotes.number, `${prefix}%`));
  return `${prefix}${String(existing.length + 1).padStart(4, "0")}`;
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

  const clientId = typeof body.clientId === "string" ? body.clientId : "";
  if (!clientId) throw new CrmError(400, "clientId is required");

  const [client] = await db
    .select({ id: crmClients.id })
    .from(crmClients)
    .where(eq(crmClients.id, clientId))
    .limit(1);
  if (!client) throw new CrmError(400, "Client not found");

  let installationId: string | undefined;
  if (typeof body.installationId === "string" && body.installationId) {
    const [installation] = await db
      .select({ id: crmInstallations.id })
      .from(crmInstallations)
      .where(eq(crmInstallations.id, body.installationId))
      .limit(1);
    if (!installation) throw new CrmError(400, "Installation not found");
    installationId = body.installationId;
  }

  const items = parseItems(body.items);
  const taxRate = taxRateOf(body.taxRate);
  const totals = computeTotals(items, taxRate);
  const status = QUOTE_STATUSES.find((s) => s === body.status) ?? "draft";
  const number = await nextQuoteNumber();

  const [quote] = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(crmQuotes)
      .values({
        number,
        clientId,
        installationId,
        title: typeof body.title === "string" ? body.title : null,
        status,
        taxRate,
        ...totals,
        validUntil:
          typeof body.validUntil === "string" ? new Date(body.validUntil) : null,
        notes: typeof body.notes === "string" ? body.notes : null,
      })
      .returning();
    await tx
      .insert(crmQuoteItems)
      .values(items.map((i) => ({ quoteId: created.id, ...i })));
    return [created];
  });

  return ok({ quote: serializeQuote(quote) }, { status: 201 });
});
