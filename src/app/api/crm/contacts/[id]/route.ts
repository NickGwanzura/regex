import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { crmContacts } from "@/lib/db/schema";
import { CrmError, ok, readJson, requireAdmin, wrap } from "@/lib/crm";
import { firstIssue, updateContact } from "@/lib/validation";

export const GET = wrap(
  async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    await requireAdmin();
    const { id } = await ctx.params;

    const [contact] = await db
      .select()
      .from(crmContacts)
      .where(eq(crmContacts.id, id))
      .limit(1);
    if (!contact) throw new CrmError(404, "Contact not found");

    return ok({ contact });
  },
);

export const PATCH = wrap(
  async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    await requireAdmin();
    const { id } = await ctx.params;
    const body = await readJson(req);
    const parsed = updateContact.safeParse(body);
    if (!parsed.success) throw new CrmError(400, firstIssue(parsed.error));
    const data = parsed.data;

    const [existing] = await db
      .select()
      .from(crmContacts)
      .where(eq(crmContacts.id, id))
      .limit(1);
    if (!existing) throw new CrmError(404, "Contact not found");

    const patch: Record<string, unknown> = { updatedAt: new Date() };

    if (data.name !== undefined) patch.name = data.name;
    for (const field of ["email", "phone", "role"] as const) {
      if (data[field] !== undefined) patch[field] = data[field] ?? null;
    }
    if (data.isPrimary !== undefined) patch.isPrimary = data.isPrimary;

    const [contact] = await db
      .update(crmContacts)
      .set(patch)
      .where(eq(crmContacts.id, id))
      .returning();

    return ok({ contact });
  },
);

export const DELETE = wrap(
  async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    await requireAdmin();
    const { id } = await ctx.params;

    const [existing] = await db
      .select()
      .from(crmContacts)
      .where(eq(crmContacts.id, id))
      .limit(1);
    if (!existing) throw new CrmError(404, "Contact not found");

    await db.delete(crmContacts).where(eq(crmContacts.id, id));
    return ok({ deleted: true });
  },
);
