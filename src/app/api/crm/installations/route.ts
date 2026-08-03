import { NextRequest } from "next/server";
import { and, desc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { crmClients, crmInstallations } from "@/lib/db/schema";
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

export const GET = wrap(async (req: NextRequest) => {
  await requireAdmin();
  const { searchParams } = new URL(req.url);
  const clientId = searchParams.get("clientId");
  const status =
    INSTALLATION_STATUSES.find((s) => s === searchParams.get("status")) ??
    undefined;

  const where = and(
    clientId ? eq(crmInstallations.clientId, clientId) : undefined,
    status ? eq(crmInstallations.status, status) : undefined,
  );

  const installations = await db
    .select()
    .from(crmInstallations)
    .where(where)
    .orderBy(desc(crmInstallations.createdAt));

  return ok({
    installations: installations.map(serializeInstallation),
  });
});

export const POST = wrap(async (req: NextRequest) => {
  await requireAdmin();
  const body = await readJson(req);

  const clientId = typeof body.clientId === "string" ? body.clientId : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!clientId) throw new CrmError(400, "clientId is required");
  if (!name) throw new CrmError(400, "name is required");

  const serviceType = SERVICE_TYPES.find((s) => s === body.serviceType);
  if (!serviceType) {
    throw new CrmError(
      400,
      `serviceType is required (one of: ${SERVICE_TYPES.join(", ")})`,
    );
  }
  const engagementModel = ENGAGEMENT_MODELS.find((m) => m === body.engagementModel);
  if (!engagementModel) {
    throw new CrmError(
      400,
      `engagementModel is required (one of: ${ENGAGEMENT_MODELS.join(", ")})`,
    );
  }

  const [client] = await db
    .select({ id: crmClients.id })
    .from(crmClients)
    .where(eq(crmClients.id, clientId))
    .limit(1);
  if (!client) throw new CrmError(400, "Client not found");

  const status =
    INSTALLATION_STATUSES.find((s) => s === body.status) ?? "lead";

  const [installation] = await db
    .insert(crmInstallations)
    .values({
      clientId,
      name,
      serviceType,
      engagementModel,
      status,
      siteAddress:
        typeof body.siteAddress === "string" ? body.siteAddress : null,
      startDate:
        typeof body.startDate === "string" ? new Date(body.startDate) : null,
      endDate: typeof body.endDate === "string" ? new Date(body.endDate) : null,
      valueCents: toCents(typeof body.value === "number" ? body.value : 0),
      notes: typeof body.notes === "string" ? body.notes : null,
    })
    .returning();

  return ok({ installation: serializeInstallation(installation) }, {
    status: 201,
  });
});
