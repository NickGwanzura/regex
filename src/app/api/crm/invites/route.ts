import { randomBytes } from "node:crypto";

import { desc } from "drizzle-orm";

import { db } from "@/lib/db";
import { invites } from "@/lib/db/schema";
import type { Invite } from "@/lib/db/schema";
import { CrmError, ok, readJson, requireAdmin, wrap } from "@/lib/crm";
import { createInvite, firstIssue } from "@/lib/validation";
import { sendInviteEmail } from "@/lib/mail";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || process.env.BETTER_AUTH_URL || "";

function inviteStatus(i: Invite): "pending" | "accepted" | "expired" | "revoked" {
  if (i.revokedAt) return "revoked";
  if (i.acceptedAt) return "accepted";
  if (i.expiresAt.getTime() < Date.now()) return "expired";
  return "pending";
}

/** Admin-facing shape: no token, plus a convenience status and signup link. */
function serializeInvite(i: Invite) {
  const { token: _token, ...rest } = i;
  return {
    ...rest,
    status: inviteStatus(i),
    signupUrl: SITE_URL
      ? `${SITE_URL}/signup?token=${encodeURIComponent(i.token)}`
      : null,
  };
}

export const GET = wrap(async () => {
  await requireAdmin();
  const all = await db
    .select()
    .from(invites)
    .orderBy(desc(invites.createdAt));
  return ok({ invites: all.map(serializeInvite) });
});

export const POST = wrap(async (req: Request) => {
  const admin = await requireAdmin();
  const body = await readJson(req);
  const parsed = createInvite.safeParse(body);
  if (!parsed.success) throw new CrmError(400, firstIssue(parsed.error));
  const data = parsed.data;

  const email = data.email; // schema already trims + lowercases
  const role = data.role ?? "user";
  const ttlDays = data.expiresInDays ?? 7;

  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);

  // One invite per email: re-inviting refreshes the token and resets state.
  const [invite] = await db
    .insert(invites)
    .values({ email, role, token, expiresAt, createdBy: admin.id })
    .onConflictDoUpdate({
      target: invites.email,
      set: {
        role,
        token,
        expiresAt,
        acceptedAt: null,
        revokedAt: null,
        createdBy: admin.id,
        updatedAt: new Date(),
      },
    })
    .returning();

  const emailed = await sendInviteEmail(invite);
  if (!emailed) {
    console.warn(`[invites] email to ${email} was not delivered`);
  }

  return ok({ invite: serializeInvite(invite), emailed });
});
