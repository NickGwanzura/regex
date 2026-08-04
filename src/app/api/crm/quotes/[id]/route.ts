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
  resolveCurrency,
  serializeItems,
  wrap,
} from "@/lib/crm";
import { firstIssue, updateQuote } from "@/lib/validation";
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
    const parsed = updateQuote.safeParse(body);
    if (!parsed.success) throw new CrmError(400, firstIssue(parsed.error));
    const data = parsed.data;

    const [existing] = await db
      .select()
      .from(crmQuotes)
      .where(eq(crmQuotes.id, id))
      .limit(1);
    if (!existing) throw new CrmError(404, "Quote not found");

    const patch: Record<string, unknown> = { updatedAt: new Date() };

    if (data.status !== undefined) patch.status = data.status;
    if (data.taxRate !== undefined) patch.taxRate = data.taxRate ?? 0;
    if (data.title !== undefined) patch.title = data.title ?? null;
    if (data.installationId !== undefined) {
      if (data.installationId) {
        const [installation] = await db
          .select({ id: crmInstallations.id })
          .from(crmInstallations)
          .where(eq(crmInstallations.id, data.installationId))
          .limit(1);
        if (!installation) throw new CrmError(400, "Installation not found");
        patch.installationId = data.installationId;
      } else {
        patch.installationId = null;
      }
    }
    if (data.validUntil !== undefined) {
      patch.validUntil = data.validUntil ? new Date(data.validUntil) : null;
    }
    if (data.notes !== undefined) patch.notes = data.notes ?? null;
    if (data.currency !== undefined) patch.currency = resolveCurrency(data.currency);

    if (data.items) {
      const items = parseItems(data.items);
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
