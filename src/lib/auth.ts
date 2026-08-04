import "server-only";

import { and, eq, gt, isNull } from "drizzle-orm";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";

const baseURL =
  process.env.BETTER_AUTH_URL || process.env.NEXT_PUBLIC_SITE_URL || "";

export const auth = betterAuth({
  baseURL: baseURL || undefined,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
  }),
  secret: process.env.BETTER_AUTH_SECRET,
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    autoSignIn: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
  },
  user: {
    additionalFields: {
      role: {
        type: "string",
        required: false,
        defaultValue: "user",
        input: false,
      },
    },
  },
  // Invite-only signup: only emails with a valid, unaccepted invite may
  // register. Returning `false` from user.create.before aborts creation.
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          const email = (user.email ?? "").trim().toLowerCase();
          const [invite] = await db
            .select()
            .from(schema.invites)
            .where(
              and(
                eq(schema.invites.email, email),
                isNull(schema.invites.acceptedAt),
                isNull(schema.invites.revokedAt),
                gt(schema.invites.expiresAt, new Date()),
              ),
            )
            .limit(1);
          if (!invite) return false;
        },
        after: async (user) => {
          const email = (user.email ?? "").trim().toLowerCase();
          const [invite] = await db
            .select()
            .from(schema.invites)
            .where(eq(schema.invites.email, email))
            .limit(1);
          if (!invite) return;
          // Consume the invite and grant the role it carried.
          await db
            .update(schema.invites)
            .set({ acceptedAt: new Date(), updatedAt: new Date() })
            .where(eq(schema.invites.id, invite.id));
          if (invite.role && invite.role !== "user") {
            await db
              .update(schema.user)
              .set({ role: invite.role, updatedAt: new Date() })
              .where(eq(schema.user.id, user.id));
          }
        },
      },
    },
  },
  // The Drizzle adapter only resolves joined models (session.user etc.)
  // through the relational query API when joins are enabled; without this,
  // getSession returns null and nobody can log in.
  experimental: {
    joins: true,
  },
  advanced: {
    useSecureCookies: true,
  },
  trustedOrigins: [
    "http://localhost:3000",
    baseURL,
    "https://theregexcollective.com",
  ].filter(Boolean),
});
