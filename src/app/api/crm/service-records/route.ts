import { NextRequest } from "next/server";
import { and, asc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { crmClients, crmInstallations, crmServiceRecords } from "@/lib/db/schema";
import { CrmError, dollars, ok, readJson, requireAdmin, toCents, wrap } from "@/lib/crm";
import {
  RECORD_KINDS,
  RECORD_STATUSES,
  createServiceRecord,
  firstIssue,
} from "@/lib/validation";

export const GET = wrap(async (req: NextRequest) => {
  await requireAdmin();
  const { searchParams } = new URL(req.url);
  const clientId = searchParams.get("clientId");
  const installationId = searchParams.get("installationId");
  const status = RECORD_STATUSES.find((s) => s === searchParams.get("status"));

  const where = and(
    clientId ? eq(crmServiceRecords.clientId, clientId) : undefined,
    installationId
      ? eq(crmServiceRecords.installationId, installationId)
      : undefined,
    status ? eq(crmServiceRecords.status, status) : undefined,
  );

  const records = await db
    .select()
    .from(crmServiceRecords)
    .where(where)
    .orderBy(asc(crmServiceRecords.serviceDate));

  return ok({
    records: records.map((r) => ({
      ...r,
      cost: dollars(r.costCents),
    })),
  });
});

export const POST = wrap(async (req: NextRequest) => {
  await requireAdmin();
  const body = await readJson(req);
  const parsed = createServiceRecord.safeParse(body);
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

  const durationMinutes =
    data.durationMinutes && data.durationMinutes > 0
      ? data.durationMinutes
      : data.durationHours && data.durationHours > 0
        ? Math.round(data.durationHours * 60)
        : null;

  const [record] = await db
    .insert(crmServiceRecords)
    .values({
      clientId: data.clientId,
      installationId,
      kind: data.kind ?? "site_visit",
      title: data.title,
      description: data.description ?? null,
      serviceDate: new Date(data.serviceDate),
      durationMinutes,
      costCents: toCents(data.cost ?? 0),
      status: data.status ?? "scheduled",
      notes: data.notes ?? null,
    })
    .returning();

  return ok(
    { record: { ...record, cost: dollars(record.costCents) } },
    { status: 201 },
  );
});
