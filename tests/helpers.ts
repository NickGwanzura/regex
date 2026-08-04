import { randomUUID } from "node:crypto";

import { hashPassword } from "@better-auth/utils/password";
import { sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { account, session, user } from "@/lib/db/schema";

// ---------------------------------------------------------------------------
// Route invocation
// ---------------------------------------------------------------------------

export interface ApiOptions {
  method?: string;
  body?: unknown;
  /** Session token; omit for an unauthenticated request. */
  token?: string;
  /** Query string, e.g. "?clientId=..." */
  search?: string;
  /** Path params for [id] routes, e.g. { id: "..." } */
  params?: Record<string, string>;
}

export interface ApiResult {
  status: number;
  body: Record<string, unknown> | null;
}

/**
 * Better Auth signs the session cookie: the raw token is stored in the DB, but
 * the cookie carries `encodeURIComponent(token + "." + b64(HMAC-SHA256(secret,
 * token)))`. Replicate that so getSession() accepts our fabricated cookies.
 */
async function signSessionToken(token: string): Promise<string> {
  const enc = new TextEncoder();
  const secret = process.env.BETTER_AUTH_SECRET ?? "";
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(token));
  const b64 = Buffer.from(new Uint8Array(sig)).toString("base64");
  return encodeURIComponent(`${token}.${b64}`);
}

// auth.ts sets `advanced.useSecureCookies: true`, which prefixes the session
// cookie name with `__Secure-` (even in dev). getSession() looks up exactly
// that name, so the cookie header must use it.
const SESSION_COOKIE = "__Secure-better-auth.session_token";

/**
 * Invokes a Next.js route handler directly with a Request (no server needed).
 * The handler is cast through `unknown` so any of the exported GET/POST/PATCH/
 * DELETE route functions can be passed.
 */
export async function api(
  handler: unknown,
  opts: ApiOptions = {},
): Promise<ApiResult> {
  const headers = new Headers({ "content-type": "application/json" });
  if (opts.token) {
    headers.set(
      "cookie",
      `${SESSION_COOKIE}=${await signSessionToken(opts.token)}`,
    );
  }
  globalThis.__setRequestHeaders(headers);

  const req = new Request(`http://localhost${opts.search ?? ""}`, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });

  try {
    const res = await (handler as (
      req: Request,
      ctx: { params: Promise<Record<string, string>> },
    ) => Promise<Response>)(req, { params: Promise.resolve(opts.params ?? {}) });
    const body = (await res.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    return { status: res.status, body };
  } finally {
    globalThis.__setRequestHeaders(null);
  }
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

/** Inserts a user row; returns the full row. */
export async function createUser(role: "admin" | "user" = "admin") {
  const [row] = await db
    .insert(user)
    .values({
      id: randomUUID(),
      name: "Test User",
      email: `user-${randomUUID()}@test.local`,
      emailVerified: true,
      image: null,
      role,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();
  return row;
}

/** Inserts a valid session row and returns its token (for the cookie). */
export async function createSessionFor(userId: string): Promise<string> {
  const token = `${randomUUID()}${randomUUID()}`;
  await db.insert(session).values({
    id: randomUUID(),
    token,
    userId,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    createdAt: new Date(),
    updatedAt: new Date(),
    ipAddress: null,
    userAgent: null,
  });
  return token;
}

export async function adminToken(): Promise<string> {
  const u = await createUser("admin");
  return createSessionFor(u.id);
}

export async function userToken(): Promise<string> {
  const u = await createUser("user");
  return createSessionFor(u.id);
}

// ---------------------------------------------------------------------------
// Credential-based users (for smoke-testing the real login endpoint)
// ---------------------------------------------------------------------------

export interface CredentialUser {
  userId: string;
  email: string;
  password: string;
}

/**
 * Creates a user + credential account that Better Auth's sign-in endpoint can
 * authenticate against (providerId 'credential', password hashed exactly like
 * the production admin seed). Returns the plaintext password so tests can send
 * it to /sign-in/email.
 */
export async function createCredentialUser(
  role: "admin" | "user" = "admin",
  overrides: { email?: string; password?: string } = {},
): Promise<CredentialUser> {
  const password = overrides.password ?? "CorrectHorseBatteryStaple1!";
  const email = (overrides.email ?? `login-${randomUUID()}@test.local`).trim().toLowerCase();
  const passwordHash = await hashPassword(password);

  const [row] = await db
    .insert(user)
    .values({
      id: randomUUID(),
      name: "Login Test User",
      email,
      emailVerified: true,
      image: null,
      role,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  await db.insert(account).values({
    id: randomUUID(),
    accountId: row.id,
    providerId: "credential",
    userId: row.id,
    password: passwordHash,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  return { userId: row.id, email, password };
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

/** Empties every table (cascade handles the rest of the FK graph). */
export async function resetDb(): Promise<void> {
  await db.execute(
    sql`TRUNCATE crm_clients, crm_leads, invites, "user" RESTART IDENTITY CASCADE`,
  );
}
