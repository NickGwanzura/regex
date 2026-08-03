import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { crmPayments } from "@/lib/db/schema";
import {
  CrmError,
  dollars,
  ok,
  recomputeInvoiceStatus,
  requireAdmin,
  wrap,
} from "@/lib/crm";

export const GET = wrap(
  async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    await requireAdmin();
    const { id } = await ctx.params;

    const [payment] = await db
      .select()
      .from(crmPayments)
      .where(eq(crmPayments.id, id))
      .limit(1);
    if (!payment) throw new CrmError(404, "Payment not found");

    return ok({ payment: { ...payment, amount: dollars(payment.amountCents) } });
  },
);

export const DELETE = wrap(
  async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    await requireAdmin();
    const { id } = await ctx.params;

    const [payment] = await db
      .select()
      .from(crmPayments)
      .where(eq(crmPayments.id, id))
      .limit(1);
    if (!payment) throw new CrmError(404, "Payment not found");

    const invoiceId = payment.invoiceId;
    await db.delete(crmPayments).where(eq(crmPayments.id, id));
    await recomputeInvoiceStatus(invoiceId);

    return ok({ deleted: true });
  },
);
