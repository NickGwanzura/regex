import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { crmExpenses, crmInstallations } from "@/lib/db/schema";
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
import { firstIssue, updateExpense } from "@/lib/validation";
import type { CrmExpense } from "@/lib/db/schema";

function serializeExpense(e: CrmExpense) {
  return { ...e, amount: dollars(e.amountCents) };
}

export const GET = wrap(
  async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    await requireAdmin();
    const { id } = await ctx.params;

    const [expense] = await db
      .select()
      .from(crmExpenses)
      .where(eq(crmExpenses.id, id))
      .limit(1);
    if (!expense) throw new CrmError(404, "Expense not found");

    return ok({ expense: serializeExpense(expense) });
  },
);

export const PATCH = wrap(
  async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    await requireAdmin();
    const { id } = await ctx.params;
    const body = await readJson(req);
    const parsed = updateExpense.safeParse(body);
    if (!parsed.success) throw new CrmError(400, firstIssue(parsed.error));
    const data = parsed.data;

    const [existing] = await db
      .select()
      .from(crmExpenses)
      .where(eq(crmExpenses.id, id))
      .limit(1);
    if (!existing) throw new CrmError(404, "Expense not found");

    const patch: Record<string, unknown> = { updatedAt: new Date() };

    if (data.description !== undefined) patch.description = data.description;
    if (data.category !== undefined) patch.category = data.category;
    if (data.currency !== undefined) patch.currency = resolveCurrency(data.currency);
    if (data.amount !== undefined) patch.amountCents = toCents(data.amount);
    if (data.date !== undefined) patch.date = new Date(data.date);
    if (data.notes !== undefined) patch.notes = data.notes ?? null;

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

    const [expense] = await db
      .update(crmExpenses)
      .set(patch)
      .where(eq(crmExpenses.id, id))
      .returning();

    return ok({ expense: serializeExpense(expense) });
  },
);

export const DELETE = wrap(
  async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    await requireAdmin();
    const { id } = await ctx.params;

    const [existing] = await db
      .select()
      .from(crmExpenses)
      .where(eq(crmExpenses.id, id))
      .limit(1);
    if (!existing) throw new CrmError(404, "Expense not found");

    await db.delete(crmExpenses).where(eq(crmExpenses.id, id));
    return ok({ deleted: true });
  },
);
