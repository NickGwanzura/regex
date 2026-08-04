import { NextRequest } from "next/server";
import { and, desc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { crmClients, crmInstallations } from "@/lib/db/schema";
import {
  ENGAGEMENT_MODELS,
  INSTALLATION_STATUSES,
  CrmError,
  dollars,
  ok,
  readJson,
  requireAdmin,
  toCents,
  wrap,
} from "@/lib/crm";
import { createInstallation, firstIssue } from "@/lib/validation";
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
  const parsed = createInstallation.safeParse(body);
  if (!parsed.success) throw new CrmError(400, firstIssue(parsed.error));
  const data = parsed.data;

  const [client] = await db
    .select({ id: crmClients.id })
    .from(crmClients)
    .where(eq(crmClients.id, data.clientId))
    .limit(1);
  if (!client) throw new CrmError(400, "Client not found");

  const [installation] = await db
    .insert(crmInstallations)
    .values({
      clientId: data.clientId,
      name: data.name,
      serviceType: data.serviceType,
      engagementModel: data.engagementModel,
      status: data.status ?? "lead",
      siteAddress: data.siteAddress ?? null,
      startDate: data.startDate ? new Date(data.startDate) : null,
      endDate: data.endDate ? new Date(data.endDate) : null,
      valueCents: toCents(data.value ?? 0),
      notes: data.notes ?? null,
    })
    .returning();

  return ok({ installation: serializeInstallation(installation) }, {
    status: 201,
  });
});
