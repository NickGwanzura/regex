import { NextRequest } from "next/server";
import { and, desc, eq, ilike, or } from "drizzle-orm";

import { db } from "@/lib/db";
import { crmClients } from "@/lib/db/schema";
import { CLIENT_STATUSES, CrmError, ok, readJson, requireAdmin, wrap } from "@/lib/crm";
import { createClient, firstIssue } from "@/lib/validation";

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
  const parsed = createClient.safeParse(body);
  if (!parsed.success) throw new CrmError(400, firstIssue(parsed.error));
  const data = parsed.data;

  const [client] = await db
    .insert(crmClients)
    .values({
      name: data.name,
      industry: data.industry ?? null,
      billingEmail: data.billingEmail ?? null,
      billingPhone: data.billingPhone ?? null,
      billingAddress: data.billingAddress ?? null,
      website: data.website ?? null,
      status: data.status ?? "lead",
      notes: data.notes ?? null,
    })
    .returning();

  return ok({ client }, { status: 201 });
});
