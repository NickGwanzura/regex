import { NextRequest } from "next/server";
import { and, asc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { crmClients, crmInstallations, crmServiceRecords } from "@/lib/db/schema";
import {
  CrmError,
  dollars,
  ok,
  readJson,
  requireAdmin,
  toCents,
  wrap,
} from "@/lib/crm";

const RECORD_KINDS = [
  "monthly_support",
  "health_check",
  "site_visit",
  "remote_support",
  "report",
] as const;

const RECORD_STATUSES = ["scheduled", "completed", "cancelled"] as const;

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

  const clientId = typeof body.clientId === "string" ? body.clientId : "";
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!clientId) throw new CrmError(400, "clientId is required");
  if (!title) throw new CrmError(400, "title is required");

  const serviceDate =
    typeof body.serviceDate === "string" && body.serviceDate
      ? new Date(body.serviceDate)
      : null;
  if (!serviceDate || Number.isNaN(serviceDate.getTime())) {
    throw new CrmError(400, "serviceDate is required (ISO date)");
  }

  const [client] = await db
    .select({ id: crmClients.id })
    .from(crmClients)
    .where(eq(crmClients.id, clientId))
    .limit(1);
  if (!client) throw new CrmError(400, "Client not found");

  let installationId: string | null = null;
  if (typeof body.installationId === "string" && body.installationId) {
    const [installation] = await db
      .select({ id: crmInstallations.id })
      .from(crmInstallations)
      .where(eq(crmInstallations.id, body.installationId))
      .limit(1);
    if (!installation) throw new CrmError(400, "Installation not found");
    installationId = body.installationId;
  }

  const kind = RECORD_KINDS.find((k) => k === body.kind) ?? "site_visit";
  const status = RECORD_STATUSES.find((s) => s === body.status) ?? "scheduled";

  let durationMinutes: number | null = null;
  if (typeof body.durationMinutes === "number" && body.durationMinutes > 0) {
    durationMinutes = Math.round(body.durationMinutes);
  } else if (typeof body.durationHours === "number" && body.durationHours > 0) {
    durationMinutes = Math.round(body.durationHours * 60);
  }

  const [record] = await db
    .insert(crmServiceRecords)
    .values({
      clientId,
      installationId,
      kind,
      title,
      description:
        typeof body.description === "string" ? body.description : null,
      serviceDate,
      durationMinutes,
      costCents: toCents(typeof body.cost === "number" ? body.cost : 0),
      status,
      notes: typeof body.notes === "string" ? body.notes : null,
    })
    .returning();

  return ok(
    { record: { ...record, cost: dollars(record.costCents) } },
    { status: 201 },
  );
});
