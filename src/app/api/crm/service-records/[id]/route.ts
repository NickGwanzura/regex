import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { crmInstallations, crmServiceRecords } from "@/lib/db/schema";
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

    const [existing] = await db
      .select()
      .from(crmServiceRecords)
      .where(eq(crmServiceRecords.id, id))
      .limit(1);
    if (!existing) throw new CrmError(404, "Service record not found");

    const patch: Record<string, unknown> = { updatedAt: new Date() };

    if (typeof body.title === "string") {
      const title = body.title.trim();
      if (!title) throw new CrmError(400, "title cannot be empty");
      patch.title = title;
    }
    if ("kind" in body) {
      const kind = RECORD_KINDS.find((k) => k === body.kind);
      if (!kind) throw new CrmError(400, "invalid kind");
      patch.kind = kind;
    }
    if ("status" in body) {
      const status = RECORD_STATUSES.find((s) => s === body.status);
      if (!status) throw new CrmError(400, "invalid status");
      patch.status = status;
    }
    if ("serviceDate" in body) {
      const d =
        typeof body.serviceDate === "string" && body.serviceDate
          ? new Date(body.serviceDate)
          : null;
      if (!d || Number.isNaN(d.getTime())) {
        throw new CrmError(400, "invalid serviceDate");
      }
      patch.serviceDate = d;
    }
    if ("description" in body) {
      patch.description =
        typeof body.description === "string" ? body.description : null;
    }
    if ("durationMinutes" in body) {
      patch.durationMinutes =
        typeof body.durationMinutes === "number" && body.durationMinutes > 0
          ? Math.round(body.durationMinutes)
          : null;
    }
    if ("durationHours" in body) {
      patch.durationMinutes =
        typeof body.durationHours === "number" && body.durationHours > 0
          ? Math.round(body.durationHours * 60)
          : null;
    }
    if ("cost" in body) {
      patch.costCents = toCents(typeof body.cost === "number" ? body.cost : 0);
    }
    if ("notes" in body) {
      patch.notes = typeof body.notes === "string" ? body.notes : null;
    }
    if ("installationId" in body) {
      const raw = body.installationId;
      if (typeof raw === "string" && raw) {
        const [installation] = await db
          .select({ id: crmInstallations.id })
          .from(crmInstallations)
          .where(eq(crmInstallations.id, raw))
          .limit(1);
        if (!installation) throw new CrmError(400, "Installation not found");
        patch.installationId = raw;
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
