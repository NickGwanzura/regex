import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { crmContacts } from "@/lib/db/schema";
import { CrmError, ok, readJson, requireAdmin, wrap } from "@/lib/crm";

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

    const [existing] = await db
      .select()
      .from(crmContacts)
      .where(eq(crmContacts.id, id))
      .limit(1);
    if (!existing) throw new CrmError(404, "Contact not found");

    const patch: Record<string, unknown> = { updatedAt: new Date() };

    if (typeof body.name === "string") {
      const name = body.name.trim();
      if (!name) throw new CrmError(400, "name cannot be empty");
      patch.name = name;
    }
    for (const field of ["email", "phone", "role"] as const) {
      if (field in body) {
        patch[field] =
          typeof body[field] === "string" ? (body[field] as string) : null;
      }
    }
    if ("isPrimary" in body) patch.isPrimary = body.isPrimary === true;

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
