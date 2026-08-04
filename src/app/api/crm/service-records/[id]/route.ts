import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { crmInstallations, crmServiceRecords } from "@/lib/db/schema";
import { CrmError, dollars, ok, readJson, requireAdmin, resolveCurrency, toCents, wrap } from "@/lib/crm";
import { firstIssue, updateServiceRecord } from "@/lib/validation";

export const GET = wrap(
  async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    await requireAdmin();
    const { id } = await ctx.params;

    const [record] = await db
      .select()
      .from(crmServiceRecords)
      .where(eq(crmServiceRecords.id, id))
      .limit(1);
    if (!record) throw new CrmError(404, "Service record not found");

    return ok({ record: { ...record, cost: dollars(record.costCents) } });
  },
);

export const PATCH = wrap(
  async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    await requireAdmin();
    const { id } = await ctx.params;
    const body = await readJson(req);
    const parsed = updateServiceRecord.safeParse(body);
    if (!parsed.success) throw new CrmError(400, firstIssue(parsed.error));
    const data = parsed.data;

    const [existing] = await db
      .select()
      .from(crmServiceRecords)
      .where(eq(crmServiceRecords.id, id))
      .limit(1);
    if (!existing) throw new CrmError(404, "Service record not found");

    const patch: Record<string, unknown> = { updatedAt: new Date() };

    if (data.title !== undefined) patch.title = data.title;
    if (data.kind !== undefined) patch.kind = data.kind;
    if (data.status !== undefined) patch.status = data.status;
    if (data.serviceDate !== undefined) {
      patch.serviceDate = new Date(data.serviceDate);
    }
    if (data.description !== undefined) {
      patch.description = data.description ?? null;
    }
    if (data.durationMinutes !== undefined) {
      patch.durationMinutes =
        (data.durationMinutes ?? 0) > 0 ? data.durationMinutes : null;
    }
    if (data.durationHours !== undefined && data.durationHours !== null) {
      patch.durationMinutes =
        data.durationHours > 0 ? Math.round(data.durationHours * 60) : null;
    }
    if (data.cost !== undefined) {
      patch.costCents = toCents(data.cost ?? 0);
    }
    if (data.currency !== undefined) patch.currency = resolveCurrency(data.currency);
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

    const [record] = await db
      .update(crmServiceRecords)
      .set(patch)
      .where(eq(crmServiceRecords.id, id))
      .returning();

    return ok({ record: { ...record, cost: dollars(record.costCents) } });
  },
);

export const DELETE = wrap(
  async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    await requireAdmin();
    const { id } = await ctx.params;

    const [existing] = await db
      .select()
      .from(crmServiceRecords)
      .where(eq(crmServiceRecords.id, id))
      .limit(1);
    if (!existing) throw new CrmError(404, "Service record not found");

    await db.delete(crmServiceRecords).where(eq(crmServiceRecords.id, id));
    return ok({ deleted: true });
  },
);
