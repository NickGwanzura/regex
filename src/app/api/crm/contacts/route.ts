import { NextRequest } from "next/server";
import { asc, desc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { crmClients, crmContacts } from "@/lib/db/schema";
import { CrmError, ok, readJson, requireAdmin, wrap } from "@/lib/crm";
import { createContact, firstIssue } from "@/lib/validation";

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
  const parsed = createContact.safeParse(body);
  if (!parsed.success) throw new CrmError(400, firstIssue(parsed.error));
  const data = parsed.data;

  const [client] = await db
    .select({ id: crmClients.id })
    .from(crmClients)
    .where(eq(crmClients.id, data.clientId))
    .limit(1);
  if (!client) throw new CrmError(400, "Client not found");

  const [contact] = await db
    .insert(crmContacts)
    .values({
      clientId: data.clientId,
      name: data.name,
      email: data.email ?? null,
      phone: data.phone ?? null,
      role: data.role ?? null,
      isPrimary: data.isPrimary ?? false,
    })
    .returning();

  return ok({ contact }, { status: 201 });
});
