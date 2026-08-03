import { NextRequest } from "next/server";
import { asc, desc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  crmClients,
  crmInstallations,
  crmInvoiceItems,
  crmInvoices,
  crmPayments,
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
  serializeItems,
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

export const GET = wrap(
  async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    await requireAdmin();
    const { id } = await ctx.params;

    const [row] = await db
      .select({ invoice: crmInvoices, clientName: crmClients.name })
      .from(crmInvoices)
      .innerJoin(crmClients, eq(crmClients.id, crmInvoices.clientId))
      .where(eq(crmInvoices.id, id))
      .limit(1);
    if (!row) throw new CrmError(404, "Invoice not found");

    const [items, payments] = await Promise.all([
      db
        .select()
        .from(crmInvoiceItems)
        .where(eq(crmInvoiceItems.invoiceId, id))
        .orderBy(asc(crmInvoiceItems.id)),
      db
        .select()
        .from(crmPayments)
        .where(eq(crmPayments.invoiceId, id))
        .orderBy(desc(crmPayments.paidAt)),
    ]);

    const paidCents = payments.reduce((acc, p) => acc + p.amountCents, 0);

    return ok({
      invoice: {
        ...serializeInvoice(row.invoice),
        clientName: row.clientName,
        paid: dollars(paidCents),
        balance: dollars(Math.max(0, row.invoice.totalCents - paidCents)),
      },
      items: serializeItems(items),
      payments: payments.map((p) => ({
        ...p,
        amount: dollars(p.amountCents),
      })),
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
      .from(crmInvoices)
      .where(eq(crmInvoices.id, id))
      .limit(1);
    if (!existing) throw new CrmError(404, "Invoice not found");

    const patch: Record<string, unknown> = { updatedAt: new Date() };

    if ("status" in body) {
      const status = INVOICE_STATUSES.find((s) => s === body.status);
      if (!status) throw new CrmError(400, "invalid status");
      patch.status = status;
      patch.paidAt = status === "paid" ? new Date() : null;
    }
    if ("taxRate" in body) patch.taxRate = taxRateOf(body.taxRate);
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
    if ("issueDate" in body) {
      patch.issueDate =
        typeof body.issueDate === "string" && body.issueDate
          ? new Date(body.issueDate)
          : new Date();
    }
    if ("dueDate" in body) {
      patch.dueDate =
        typeof body.dueDate === "string" && body.dueDate
          ? new Date(body.dueDate)
          : null;
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
        await tx.delete(crmInvoiceItems).where(eq(crmInvoiceItems.invoiceId, id));
        await tx
          .insert(crmInvoiceItems)
          .values(items.map((i) => ({ invoiceId: id, ...i })));
        await tx
          .update(crmInvoices)
          .set({ ...patch, ...totals })
          .where(eq(crmInvoices.id, id));
      });
    } else {
      const items = await db
        .select()
        .from(crmInvoiceItems)
        .where(eq(crmInvoiceItems.invoiceId, id));
      const totals = computeTotals(
        items,
        (patch.taxRate as number) ?? existing.taxRate,
      );
      await db
        .update(crmInvoices)
        .set({ ...patch, ...totals })
        .where(eq(crmInvoices.id, id));
    }

    const [updated] = await db
      .select()
      .from(crmInvoices)
      .where(eq(crmInvoices.id, id))
      .limit(1);

    return ok({ invoice: serializeInvoice(updated) });
  },
);

export const DELETE = wrap(
  async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    await requireAdmin();
    const { id } = await ctx.params;

    const [existing] = await db
      .select()
      .from(crmInvoices)
      .where(eq(crmInvoices.id, id))
      .limit(1);
    if (!existing) throw new CrmError(404, "Invoice not found");

    const [payment] = await db
      .select({ id: crmPayments.id })
      .from(crmPayments)
      .where(eq(crmPayments.invoiceId, id))
      .limit(1);
    if (payment) {
      throw new CrmError(
        409,
        "Cannot delete an invoice that has payments. Mark it void instead.",
      );
    }

    await db.delete(crmInvoices).where(eq(crmInvoices.id, id));
    return ok({ deleted: true });
  },
);
