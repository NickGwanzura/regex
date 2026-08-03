import "server-only";

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
  advanced: {
    useSecureCookies: true,
  },
  trustedOrigins: [
    "http://localhost:3000",
    baseURL,
    "https://theregexcollective.com",
  ].filter(Boolean),
});
