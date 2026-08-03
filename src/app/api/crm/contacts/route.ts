import { NextRequest } from "next/server";
import { asc, desc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { crmClients, crmContacts } from "@/lib/db/schema";
import { CrmError, ok, readJson, requireAdmin, wrap } from "@/lib/crm";

export const GET = wrap(async (req: NextRequest) => {
  await requireAdmin();
  const { searchParams } = new URL(req.url);
  const clientId = searchParams.get("clientId");

  const contacts = await db
    .select()
    .from(crmContacts)
    .where(clientId ? eq(crmContacts.clientId, clientId) : undefined)
    .orderBy(desc(crmContacts.isPrimary), asc(crmContacts.createdAt));

  return ok({ contacts });
});

export const POST = wrap(async (req: NextRequest) => {
  await requireAdmin();
  const body = await readJson(req);

  const clientId = typeof body.clientId === "string" ? body.clientId : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!clientId) throw new CrmError(400, "clientId is required");
  if (!name) throw new CrmError(400, "name is required");

  const [client] = await db
    .select({ id: crmClients.id })
    .from(crmClients)
    .where(eq(crmClients.id, clientId))
    .limit(1);
  if (!client) throw new CrmError(400, "Client not found");

  const [contact] = await db
    .insert(crmContacts)
    .values({
      clientId,
      name,
      email: typeof body.email === "string" ? body.email : null,
      phone: typeof body.phone === "string" ? body.phone : null,
      role: typeof body.role === "string" ? body.role : null,
      isPrimary: body.isPrimary === true,
    })
    .returning();

  return ok({ contact }, { status: 201 });
});
