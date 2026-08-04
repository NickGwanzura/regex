import { beforeEach, describe, expect, it } from "vitest";

import { auth } from "@/lib/auth";

import { createCredentialUser, resetDb } from "./helpers";

/**
 * Smoke test for the unified login portal. Unlike the auth-guard suite (which
 * fabricates sessions by inserting session rows), these tests go through the
 * real Better Auth sign-in endpoint — the exact code path the login page uses
 * when it calls authClient.signIn.email. It verifies password hashing, session
 * creation, cookie issuance and role propagation end to end.
 */

// The login page calls POST /api/auth/sign-in/email (via signIn.email). This
// helper posts a JSON body to that path through the real auth handler.
async function signInWith(
  email: string,
  password: string,
): Promise<{ status: number; setCookie: string | null; body: Record<string, unknown> | null }> {
  const res = await auth.handler(
    new Request("http://localhost/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    }),
  );
  const setCookie = res.headers.get("set-cookie");
  const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  return { status: res.status, setCookie, body };
}

describe("login smoke test", () => {
  beforeEach(resetDb);

  it("logs an admin in with correct credentials and issues a session cookie", async () => {
    const { email, password } = await createCredentialUser("admin");
    const { status, setCookie, body } = await signInWith(email, password);

    expect(status).toBe(200);
    expect(setCookie).toMatch(/__Secure-better-auth.session_token=/);

    // Sign-in returns the user; the session cookie should authenticate it.
    const session = await auth.api.getSession({
      headers: new Headers({ cookie: setCookie! }),
    });
    expect(session?.user?.email?.toLowerCase()).toBe(email);
    expect(session?.user?.role).toBe("admin");
    expect(body?.user).not.toBeNull();
  });

  it("logs a client (role=user) in and keeps the role", async () => {
    const { email, password } = await createCredentialUser("user");
    const { setCookie } = await signInWith(email, password);

    expect(setCookie).toMatch(/__Secure-better-auth.session_token=/);
    const session = await auth.api.getSession({
      headers: new Headers({ cookie: setCookie! }),
    });
    expect(session?.user?.role).toBe("user");
  });

  it("rejects a wrong password with 401 and no session cookie", async () => {
    const { email } = await createCredentialUser("admin");
    const { status, setCookie, body } = await signInWith(email, "WrongPassword9!");

    expect(status).toBe(401);
    expect(setCookie).toBeNull();
    expect(body?.message || body?.error).toBeTruthy();
  });

  it("rejects an unknown account (no username enumeration)", async () => {
    const { status, setCookie } = await signInWith("nobody@nowhere.local", "WhateverPassword1!");
    expect(status).toBe(401);
    expect(setCookie).toBeNull();
  });
});
