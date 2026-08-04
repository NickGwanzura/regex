import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { invites } from "@/lib/db/schema";
import { adminToken, createSessionFor, createUser } from "./helpers";

const SECRET = process.env.BETTER_AUTH_SECRET!;

async function sign(token: string) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(token));
  const b64 = Buffer.from(new Uint8Array(sig)).toString("base64");
  return { b64, signed: encodeURIComponent(`${token}.${b64}`) };
}

describe("debug session", () => {
  it("sign then verify roundtrip", async () => {
    const token = `${randomUUID()}${randomUUID()}`;
    const { b64 } = await sign(token);
    console.log("SIG LEN:", b64.length, "ENDS =:", b64.endsWith("="));
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode(SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const raw = Buffer.from(b64, "base64");
    const ok = await crypto.subtle.verify(
      "HMAC",
      key,
      raw,
      enc.encode(token),
    );
    console.log("SELF-VERIFY:", ok);
    expect(ok).toBe(true);
  });

  it("getSession via hand-signed cookie", async () => {
    const token = await adminToken();
    const { signed } = await sign(token);
    const res = await auth.api.getSession({
      headers: new Headers({ cookie: `better-auth.session_token=${signed}` }),
    });
    console.log("GETSESSION HAND-SIGNED:", JSON.stringify(res));
    expect(res).not.toBeNull();
  });

  it("real signup through auth handler produces working session", async () => {
    const email = `real-${randomUUID()}@test.local`;
    await db.insert(invites).values({
      id: randomUUID(),
      email,
      role: "admin",
      token: randomUUID(),
      expiresAt: new Date(Date.now() + 86400000),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const res = await auth.handler(
      new Request("http://localhost/api/auth/sign-up/email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email,
          password: "password123",
          name: "Real User",
        }),
      }),
    );
    console.log("SIGNUP STATUS:", res.status);
    const setCookie = res.headers.get("set-cookie");
    console.log("SET-COOKIE:", setCookie);
    const body = await res.json().catch(() => null);
    console.log("SIGNUP BODY:", JSON.stringify(body));
    expect(res.status).toBe(200);
  });
});
