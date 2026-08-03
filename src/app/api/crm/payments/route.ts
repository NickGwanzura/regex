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

const PAYMENT_METHODS = [
  "bank_transfer",
  "card",
  "cash",
  "cheque",
  "other",
] as const;

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

  const invoiceId = typeof body.invoiceId === "string" ? body.invoiceId : "";
  if (!invoiceId) throw new CrmError(400, "invoiceId is required");

  const [invoice] = await db
    .select()
    .from(crmInvoices)
    .where(eq(crmInvoices.id, invoiceId))
    .limit(1);
  if (!invoice) throw new CrmError(400, "Invoice not found");
  if (invoice.status === "void") {
    throw new CrmError(400, "Cannot record a payment against a void invoice");
  }

  const amountCents = toCents(
    typeof body.amount === "number" ? body.amount : NaN,
  );
  if (amountCents <= 0) {
    throw new CrmError(400, "amount must be a positive number");
  }

  const method = PAYMENT_METHODS.find((m) => m === body.method) ?? "bank_transfer";

  const [payment] = await db
    .insert(crmPayments)
    .values({
      invoiceId,
      amountCents,
      method,
      reference: typeof body.reference === "string" ? body.reference : null,
      paidAt:
        typeof body.paidAt === "string" && body.paidAt
          ? new Date(body.paidAt)
          : new Date(),
      notes: typeof body.notes === "string" ? body.notes : null,
    })
    .returning();

  await recomputeInvoiceStatus(invoiceId);

  return ok(
    { payment: { ...payment, amount: dollars(payment.amountCents) } },
    { status: 201 },
  );
});
