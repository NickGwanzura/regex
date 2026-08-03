import { NextRequest } from "next/server";
import { asc, desc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  crmClients,
  crmContacts,
  crmInstallations,
  crmInvoices,
  crmQuotes,
  crmServiceRecords,
} from "@/lib/db/schema";
import {
  CLIENT_STATUSES,
  CrmError,
  ok,
  readJson,
  requireAdmin,
  wrap,
} from "@/lib/crm";

export const GET = wrap(
  async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    await requireAdmin();
    const { id } = await ctx.params;

    const [row] = await db
      .select()
      .from(crmClients)
      .where(eq(crmClients.id, id))
      .limit(1);
    if (!row) throw new CrmError(404, "Client not found");

    const [contacts, installations] = await Promise.all([
      db
        .select()
        .from(crmContacts)
        .where(eq(crmContacts.clientId, id))
        .orderBy(desc(crmContacts.isPrimary), asc(crmContacts.createdAt)),
      db
        .select()
        .from(crmInstallations)
        .where(eq(crmInstallations.clientId, id))
        .orderBy(desc(crmInstallations.createdAt)),
    ]);

    return ok({ client: row, contacts, installations });
  },
);

export const PATCH = wrap(
  async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    await requireAdmin();
    const { id } = await ctx.params;
    const body = await readJson(req);

    const [existing] = await db
      .select()
      .from(crmClients)
      .where(eq(crmClients.id, id))
      .limit(1);
    if (!existing) throw new CrmError(404, "Client not found");

    const patch: Record<string, unknown> = { updatedAt: new Date() };

    if (typeof body.name === "string") {
      const name = body.name.trim();
      if (!name) throw new CrmError(400, "name cannot be empty");
      patch.name = name;
    }
    for (const field of [
      "industry",
      "billingEmail",
      "billingPhone",
      "billingAddress",
      "website",
      "notes",
    ] as const) {
      if (field in body) {
        patch[field] =
          typeof body[field] === "string" ? (body[field] as string) : null;
      }
    }
    if ("status" in body) {
      const status = CLIENT_STATUSES.find((s) => s === body.status);
      if (!status) throw new CrmError(400, "invalid status");
      patch.status = status;
    }

    const [client] = await db
      .update(crmClients)
      .set(patch)
      .where(eq(crmClients.id, id))
      .returning();

    return ok({ client });
  },
);

export const DELETE = wrap(
  async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    await requireAdmin();
    const { id } = await ctx.params;

    const [existing] = await db
      .select()
      .from(crmClients)
      .where(eq(crmClients.id, id))
      .limit(1);
    if (!existing) throw new CrmError(404, "Client not found");

    const [installations, quotes, invoices, records] = await Promise.all([
      db
        .select({ id: crmInstallations.id })
        .from(crmInstallations)
        .where(eq(crmInstallations.clientId, id))
        .limit(1),
      db
        .select({ id: crmQuotes.id })
        .from(crmQuotes)
        .where(eq(crmQuotes.clientId, id))
        .limit(1),
      db
        .select({ id: crmInvoices.id })
        .from(crmInvoices)
        .where(eq(crmInvoices.clientId, id))
        .limit(1),
      db
        .select({ id: crmServiceRecords.id })
        .from(crmServiceRecords)
        .where(eq(crmServiceRecords.clientId, id))
        .limit(1),
    ]);

    if (
      installations.length > 0 ||
      quotes.length > 0 ||
      invoices.length > 0 ||
      records.length > 0
    ) {
      throw new CrmError(
        409,
        "Cannot delete a client with related installations, quotes, invoices or service records. Mark it inactive instead.",
      );
    }

    await db.delete(crmClients).where(eq(crmClients.id, id));
    return ok({ deleted: true });
  },
);
