import { NextRequest } from "next/server";
import { and, eq, gt, isNull } from "drizzle-orm";

import { db } from "@/lib/db";
import { invites } from "@/lib/db/schema";
import { ok } from "@/lib/crm";

/**
 * Public invite check, used by the signup page before (and the enforcement
 * hook after) account creation. Read-only and cheap; a slight email
 * enumeration surface is accepted because signup itself reveals the same.
 *
 *   GET /api/crm/invites/check?token=…     validate an invite link
 *   GET /api/crm/invites/check?email=…     check a typed email
 */
export const GET = async (req: NextRequest) => {
  const token = req.nextUrl.searchParams.get("token")?.trim();
  const email = req.nextUrl.searchParams.get("email")?.trim().toLowerCase();

  const conditions = [
    isNull(invites.acceptedAt),
    isNull(invites.revokedAt),
    gt(invites.expiresAt, new Date()),
  ];

  const rows = token
    ? await db
        .select()
        .from(invites)
        .where(and(eq(invites.token, token), ...conditions))
        .limit(1)
    : email
      ? await db
          .select()
          .from(invites)
          .where(and(eq(invites.email, email), ...conditions))
          .limit(1)
      : [];

  const invite = rows[0];
  if (!invite) {
    return ok({
      valid: false,
      error:
        "This invitation is not valid, has expired, or has already been used.",
    });
  }

  return ok({
    valid: true,
    email: invite.email,
    role: invite.role,
    expiresAt: invite.expiresAt,
  });
};
