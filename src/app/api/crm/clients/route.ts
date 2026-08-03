import { NextRequest } from "next/server";
import { and, desc, eq, ilike, or } from "drizzle-orm";

import { db } from "@/lib/db";
import { crmClients } from "@/lib/db/schema";
import {
  CLIENT_STATUSES,
  CrmError,
  ok,
  readJson,
  requireAdmin,
  wrap,
} from "@/lib/crm";

export const GET = wrap(async (req: NextRequest) => {
  await requireAdmin();
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("search")?.trim();
  const status =
    CLIENT_STATUSES.find((s) => s === searchParams.get("status")) ?? undefined;

  const where = and(
    q
      ? or(
          ilike(crmClients.name, `%${q}%`),
          ilike(crmClients.billingEmail, `%${q}%`),
        )
      : undefined,
    status ? eq(crmClients.status, status) : undefined,
  );

  const clients = await db
    .select()
    .from(crmClients)
    .where(where)
    .orderBy(desc(crmClients.createdAt));

  return ok({ clients });
});

export const POST = wrap(async (req: NextRequest) => {
  await requireAdmin();
  const body = await readJson(req);

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) throw new CrmError(400, "name is required");

  const status = CLIENT_STATUSES.find((s) => s === body.status) ?? "lead";

  const [client] = await db
    .insert(crmClients)
    .values({
      name,
      industry: typeof body.industry === "string" ? body.industry : null,
      billingEmail:
        typeof body.billingEmail === "string" ? body.billingEmail : null,
      billingPhone:
        typeof body.billingPhone === "string" ? body.billingPhone : null,
      billingAddress:
        typeof body.billingAddress === "string" ? body.billingAddress : null,
      website: typeof body.website === "string" ? body.website : null,
      status,
      notes: typeof body.notes === "string" ? body.notes : null,
    })
    .returning();

  return ok({ client }, { status: 201 });
});
