import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  crmClients,
  crmInstallations,
  crmInvoices,
  crmQuotes,
  crmServiceRecords,
} from "@/lib/db/schema";
import { CrmError, dollars, ok, readJson, requireAdmin, toCents, wrap } from "@/lib/crm";
import { firstIssue, updateInstallation } from "@/lib/validation";
import type { CrmInstallation } from "@/lib/db/schema";

function serializeInstallation(i: CrmInstallation) {
  return { ...i, value: dollars(i.valueCents) };
}

export const GET = wrap(
  async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    await requireAdmin();
    const { id } = await ctx.params;

    const [row] = await db
      .select({ installation: crmInstallations, clientName: crmClients.name })
      .from(crmInstallations)
      .innerJoin(crmClients, eq(crmClients.id, crmInstallations.clientId))
      .where(eq(crmInstallations.id, id))
      .limit(1);
    if (!row) throw new CrmError(404, "Installation not found");

    return ok({
      installation: {
        ...serializeInstallation(row.installation),
        clientName: row.clientName,
      },
    });
  },
);

export const PATCH = wrap(
  async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    await requireAdmin();
    const { id } = await ctx.params;
    const body = await readJson(req);
    const parsed = updateInstallation.safeParse(body);
    if (!parsed.success) throw new CrmError(400, firstIssue(parsed.error));
    const data = parsed.data;

    const [existing] = await db
      .select()
      .from(crmInstallations)
      .where(eq(crmInstallations.id, id))
      .limit(1);
    if (!existing) throw new CrmError(404, "Installation not found");

    const patch: Record<string, unknown> = { updatedAt: new Date() };

    if (data.name !== undefined) patch.name = data.name;
    if (data.serviceType !== undefined) patch.serviceType = data.serviceType;
    if (data.engagementModel !== undefined) {
      patch.engagementModel = data.engagementModel;
    }
    if (data.status !== undefined) patch.status = data.status;
    if (data.siteAddress !== undefined) {
      patch.siteAddress = data.siteAddress ?? null;
    }
    if (data.startDate !== undefined) {
      patch.startDate = data.startDate ? new Date(data.startDate) : null;
    }
    if (data.endDate !== undefined) {
      patch.endDate = data.endDate ? new Date(data.endDate) : null;
    }
    if (data.value !== undefined) {
      patch.valueCents = toCents(data.value ?? 0);
    }
    if (data.notes !== undefined) patch.notes = data.notes ?? null;

    const [installation] = await db
      .update(crmInstallations)
      .set(patch)
      .where(eq(crmInstallations.id, id))
      .returning();

    return ok({ installation: serializeInstallation(installation) });
  },
);

export const DELETE = wrap(
  async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    await requireAdmin();
    const { id } = await ctx.params;

    const [existing] = await db
      .select()
      .from(crmInstallations)
      .where(eq(crmInstallations.id, id))
      .limit(1);
    if (!existing) throw new CrmError(404, "Installation not found");

    const [quotes, invoices, records] = await Promise.all([
      db
        .select({ id: crmQuotes.id })
        .from(crmQuotes)
        .where(eq(crmQuotes.installationId, id))
        .limit(1),
      db
        .select({ id: crmInvoices.id })
        .from(crmInvoices)
        .where(eq(crmInvoices.installationId, id))
        .limit(1),
      db
        .select({ id: crmServiceRecords.id })
        .from(crmServiceRecords)
        .where(eq(crmServiceRecords.installationId, id))
        .limit(1),
    ]);

    if (quotes.length > 0 || invoices.length > 0 || records.length > 0) {
      throw new CrmError(
        409,
        "Cannot delete an installation with related quotes, invoices or service records.",
      );
    }

    await db.delete(crmInstallations).where(eq(crmInstallations.id, id));
    return ok({ deleted: true });
  },
);
