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
import {
  ENGAGEMENT_MODELS,
  INSTALLATION_STATUSES,
  SERVICE_TYPES,
  CrmError,
  dollars,
  ok,
  readJson,
  requireAdmin,
  toCents,
  wrap,
} from "@/lib/crm";
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

    const [existing] = await db
      .select()
      .from(crmInstallations)
      .where(eq(crmInstallations.id, id))
      .limit(1);
    if (!existing) throw new CrmError(404, "Installation not found");

    const patch: Record<string, unknown> = { updatedAt: new Date() };

    if (typeof body.name === "string") {
      const name = body.name.trim();
      if (!name) throw new CrmError(400, "name cannot be empty");
      patch.name = name;
    }
    if ("serviceType" in body) {
      const serviceType = SERVICE_TYPES.find((s) => s === body.serviceType);
      if (!serviceType) throw new CrmError(400, "invalid serviceType");
      patch.serviceType = serviceType;
    }
    if ("engagementModel" in body) {
      const engagementModel = ENGAGEMENT_MODELS.find(
        (m) => m === body.engagementModel,
      );
      if (!engagementModel) throw new CrmError(400, "invalid engagementModel");
      patch.engagementModel = engagementModel;
    }
    if ("status" in body) {
      const status = INSTALLATION_STATUSES.find((s) => s === body.status);
      if (!status) throw new CrmError(400, "invalid status");
      patch.status = status;
    }
    if ("siteAddress" in body) {
      patch.siteAddress =
        typeof body.siteAddress === "string" ? body.siteAddress : null;
    }
    if ("startDate" in body) {
      patch.startDate =
        typeof body.startDate === "string" ? new Date(body.startDate) : null;
    }
    if ("endDate" in body) {
      patch.endDate =
        typeof body.endDate === "string" ? new Date(body.endDate) : null;
    }
    if ("value" in body) {
      patch.valueCents = toCents(typeof body.value === "number" ? body.value : 0);
    }
    if ("notes" in body) {
      patch.notes = typeof body.notes === "string" ? body.notes : null;
    }

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
