import { NextRequest } from "next/server";
import { desc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { crmInvoices, crmPayments } from "@/lib/db/schema";
import {
  CrmError,
  dollars,
  ok,
  readJson,
  recomputeInvoiceStatus,
  requireAdmin,
  toCents,
  wrap,
} from "@/lib/crm";
import { createPayment, firstIssue } from "@/lib/validation";

export const GET = wrap(async (req: NextRequest) => {
  await requireAdmin();
  const { searchParams } = new URL(req.url);
  const invoiceId = searchParams.get("invoiceId");

  const payments = await db
    .select()
    .from(crmPayments)
    .where(invoiceId ? eq(crmPayments.invoiceId, invoiceId) : undefined)
    .orderBy(desc(crmPayments.paidAt));

  return ok({
    payments: payments.map((p) => ({ ...p, amount: dollars(p.amountCents) })),
  });
});

export const POST = wrap(async (req: NextRequest) => {
  await requireAdmin();
  const body = await readJson(req);
  const parsed = createPayment.safeParse(body);
  if (!parsed.success) throw new CrmError(400, firstIssue(parsed.error));
  const data = parsed.data;

  const [invoice] = await db
    .select()
    .from(crmInvoices)
    .where(eq(crmInvoices.id, data.invoiceId))
    .limit(1);
  if (!invoice) throw new CrmError(400, "Invoice not found");
  if (invoice.status === "void") {
    throw new CrmError(400, "Cannot record a payment against a void invoice");
  }

  const amountCents = toCents(data.amount);
  const method = data.method ?? "bank_transfer";

  const [payment] = await db
    .insert(crmPayments)
    .values({
      invoiceId: data.invoiceId,
      amountCents,
      method,
      reference: data.reference ?? null,
      paidAt: data.paidAt ? new Date(data.paidAt) : new Date(),
      notes: data.notes ?? null,
    })
    .returning();

  await recomputeInvoiceStatus(data.invoiceId);

  return ok(
    { payment: { ...payment, amount: dollars(payment.amountCents) } },
    { status: 201 },
  );
});
