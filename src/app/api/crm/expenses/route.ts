import { NextRequest } from "next/server";
import { and, desc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  crmClients,
  crmExpenses,
  crmInstallations,
} from "@/lib/db/schema";
import {
  CrmError,
  dollars,
  ok,
  readJson,
  requireAdmin,
  resolveCurrency,
  toCents,
  wrap,
} from "@/lib/crm";
import { createExpense, firstIssue } from "@/lib/validation";
import type { CrmExpense } from "@/lib/db/schema";

function serializeExpense(e: CrmExpense) {
  return { ...e, amount: dollars(e.amountCents) };
}

export const GET = wrap(async (req: NextRequest) => {
  await requireAdmin();
  const { searchParams } = new URL(req.url);
  const clientId = searchParams.get("clientId");
  const installationId = searchParams.get("installationId");

  const where = and(
    clientId ? eq(crmExpenses.clientId, clientId) : undefined,
    installationId
      ? eq(crmExpenses.installationId, installationId)
      : undefined,
  );

  const rows = await db
    .select({ expense: crmExpenses, clientName: crmClients.name })
    .from(crmExpenses)
    .innerJoin(crmClients, eq(crmClients.id, crmExpenses.clientId))
    .where(where)
    .orderBy(desc(crmExpenses.date), desc(crmExpenses.createdAt));

  return ok({
    expenses: rows.map(({ expense, clientName }) => ({
      ...serializeExpense(expense),
      clientName,
    })),
  });
});

export const POST = wrap(async (req: NextRequest) => {
  await requireAdmin();
  const body = await readJson(req);
  const parsed = createExpense.safeParse(body);
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

  const [expense] = await db
    .insert(crmExpenses)
    .values({
      clientId: data.clientId,
      installationId,
      category: data.category ?? "other",
      currency: resolveCurrency(data.currency),
      amountCents: toCents(data.amount),
      date: new Date(data.date),
      description: data.description,
      notes: data.notes ?? null,
    })
    .returning();

  return ok({ expense: serializeExpense(expense) }, { status: 201 });
});
