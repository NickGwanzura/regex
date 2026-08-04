import { NextResponse } from "next/server";
import { and, eq, gt, isNull } from "drizzle-orm";
import { toNextJsHandler } from "better-auth/next-js";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { invites } from "@/lib/db/schema";

const { GET, POST: authPOST } = toNextJsHandler(auth);

export { GET };

/**
 * Sign-up interception for invite-only access. Better Auth's own
 * /sign-up/email endpoint has no invite concept, so we verify the token the
 * signup page passes as `inviteToken`, bind the account to the invited email,
 * and only then forward to Better Auth. The databaseHooks on auth.ts remain
 * the final gate (they check the email, so a form-encoded bypass still cannot
 * register an uninvited address).
 */
export const POST = async (req: Request) => {
  if (new URL(req.url).pathname.endsWith("/sign-up/email")) {
    // The sign-up endpoint accepts JSON and form-encoded bodies; parse both
    // so a form-encoded request cannot skip the token check.
    const isForm = (req.headers.get("content-type") ?? "").includes(
      "application/x-www-form-urlencoded",
    );
    const body: Record<string, unknown> | null = isForm
      ? Object.fromEntries(
          new URLSearchParams(await req.clone().text()).entries(),
        )
      : await req.clone().json().catch(() => null);

    if (body && typeof body === "object") {
      const token =
        typeof body.inviteToken === "string" ? body.inviteToken.trim() : "";

      if (!token) {
        return NextResponse.json(
          {
            message:
              "This email has not been invited. Request access from RegEx Collective.",
            code: "INVITE_REQUIRED",
          },
          { status: 400 },
        );
      }

      const [invite] = await db
        .select()
        .from(invites)
        .where(
          and(
            eq(invites.token, token),
            isNull(invites.acceptedAt),
            isNull(invites.revokedAt),
            gt(invites.expiresAt, new Date()),
          ),
        )
        .limit(1);

      if (!invite) {
        return NextResponse.json(
          {
            message:
              "This invitation is not valid, has expired, or has already been used.",
            code: "INVITE_INVALID",
          },
          { status: 400 },
        );
      }

      const typedEmail =
        typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
      if (typedEmail && typedEmail !== invite.email) {
        return NextResponse.json(
          {
            message: "This invitation is for a different email address.",
            code: "INVITE_EMAIL_MISMATCH",
          },
          { status: 400 },
        );
      }

      // Bind the account to the invited email and drop the token before
      // handing off to Better Auth. The forwarded body is always JSON, so set
      // content-type explicitly and drop the stale content-length.
      const { inviteToken: _token, ...rest } = body;
      const headers = new Headers(req.headers);
      headers.set("content-type", "application/json");
      headers.delete("content-length");
      const nextReq = new Request(req.url, {
        method: "POST",
        headers,
        body: JSON.stringify({ ...rest, email: invite.email }),
      });
      return authPOST(nextReq);
    }
  }
  return authPOST(req);
};
