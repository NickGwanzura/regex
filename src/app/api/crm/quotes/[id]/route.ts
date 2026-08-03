import { NextRequest } from "next/server";
import { asc, eq } from "drizzle-orm";

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
  serializeItems,
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

export const GET = wrap(
  async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    await requireAdmin();
    const { id } = await ctx.params;

    const [row] = await db
      .select({ quote: crmQuotes, clientName: crmClients.name })
      .from(crmQuotes)
      .innerJoin(crmClients, eq(crmClients.id, crmQuotes.clientId))
      .where(eq(crmQuotes.id, id))
      .limit(1);
    if (!row) throw new CrmError(404, "Quote not found");

    const items = await db
      .select()
      .from(crmQuoteItems)
      .where(eq(crmQuoteItems.quoteId, id))
      .orderBy(asc(crmQuoteItems.id));

    return ok({
      quote: { ...serializeQuote(row.quote), clientName: row.clientName },
      items: serializeItems(items),
    });
  },
);

export const PATCH = wrap(
  async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    await requireAdmin();
    const { id } = await ctx.params;
    const body = await readJson(req);

    const [existing] = await db
      .select()
      .from(crmQuotes)
      .where(eq(crmQuotes.id, id))
      .limit(1);
    if (!existing) throw new CrmError(404, "Quote not found");

    const patch: Record<string, unknown> = { updatedAt: new Date() };

    if ("status" in body) {
      const status = QUOTE_STATUSES.find((s) => s === body.status);
      if (!status) throw new CrmError(400, "invalid status");
      patch.status = status;
    }
    if ("taxRate" in body) patch.taxRate = taxRateOf(body.taxRate);
    if ("title" in body) {
      patch.title = typeof body.title === "string" ? body.title : null;
    }
    if ("installationId" in body) {
      const raw = body.installationId;
      if (typeof raw === "string" && raw) {
        const [installation] = await db
          .select({ id: crmInstallations.id })
          .from(crmInstallations)
          .where(eq(crmInstallations.id, raw))
          .limit(1);
        if (!installation) throw new CrmError(400, "Installation not found");
        patch.installationId = raw;
      } else {
        patch.installationId = null;
      }
    }
    if ("validUntil" in body) {
      patch.validUntil =
        typeof body.validUntil === "string" ? new Date(body.validUntil) : null;
    }
    if ("notes" in body) {
      patch.notes = typeof body.notes === "string" ? body.notes : null;
    }

    if (Array.isArray(body.items)) {
      const items = parseItems(body.items);
      const totals = computeTotals(
        items,
        (patch.taxRate as number) ?? existing.taxRate,
      );
      await db.transaction(async (tx) => {
        await tx.delete(crmQuoteItems).where(eq(crmQuoteItems.quoteId, id));
        await tx
          .insert(crmQuoteItems)
          .values(items.map((i) => ({ quoteId: id, ...i })));
        await tx.update(crmQuotes).set({ ...patch, ...totals }).where(eq(crmQuotes.id, id));
      });
    } else {
      const items = await db
        .select()
        .from(crmQuoteItems)
        .where(eq(crmQuoteItems.quoteId, id));
      const totals = computeTotals(
        items,
        (patch.taxRate as number) ?? existing.taxRate,
      );
      await db.update(crmQuotes).set({ ...patch, ...totals }).where(eq(crmQuotes.id, id));
    }

    const [updated] = await db
      .select()
      .from(crmQuotes)
      .where(eq(crmQuotes.id, id))
      .limit(1);
    const items = await db
      .select()
      .from(crmQuoteItems)
      .where(eq(crmQuoteItems.quoteId, id))
      .orderBy(asc(crmQuoteItems.id));

    return ok({ quote: serializeQuote(updated), items: serializeItems(items) });
  },
);

export const DELETE = wrap(
  async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    await requireAdmin();
    const { id } = await ctx.params;

    const [existing] = await db
      .select()
      .from(crmQuotes)
      .where(eq(crmQuotes.id, id))
      .limit(1);
    if (!existing) throw new CrmError(404, "Quote not found");

    await db.delete(crmQuotes).where(eq(crmQuotes.id, id));
    return ok({ deleted: true });
  },
);
