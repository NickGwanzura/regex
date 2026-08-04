import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { invites } from "@/lib/db/schema";
import { CrmError, ok, requireAdmin, wrap } from "@/lib/crm";

export const DELETE = wrap(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  await requireAdmin();
  const { id } = await ctx.params;

  const [existing] = await db
    .select({ id: invites.id })
    .from(invites)
    .where(eq(invites.id, id))
    .limit(1);
  if (!existing) throw new CrmError(404, "Invite not found");

  await db.delete(invites).where(eq(invites.id, id));
  return ok({ ok: true });
});
