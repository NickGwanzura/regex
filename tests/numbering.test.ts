import { beforeEach, describe, expect, it } from "vitest";

import { POST as createClient } from "@/app/api/crm/clients/route";
import { POST as createInvoice } from "@/app/api/crm/invoices/route";
import { POST as createQuote } from "@/app/api/crm/quotes/route";

import { adminToken, api, resetDb } from "./helpers";

async function makeClient(token: string): Promise<string> {
  const res = await api(createClient, {
    token,
    method: "POST",
    body: { name: "Concurrent Corp" },
  });
  return (res.body!.client as { id: string }).id;
}

function quoteBody(clientId: string, label: string) {
  return {
    clientId,
    items: [{ description: label, qty: 1, unitPrice: 10 }],
  };
}

async function fireConcurrent(token: string, clientId: string, n: number, handler: unknown, makeBody: (i: number) => unknown) {
  return Promise.all(
    Array.from({ length: n }, (_, i) =>
      api(handler, {
        token,
        method: "POST",
        body: makeBody(i),
      }),
    ),
  );
}

/** Extracts the numeric sequence from numbers like "Q-2026-0007" / "INV-2026-0007". */
function sequenceOf(numbers: string[]): number[] {
  return numbers.map((n) => parseInt(n.split("-")[2], 10));
}

describe("advisory-lock numbering", () => {
  let token: string;
  let clientId: string;

  beforeEach(async () => {
    await resetDb();
    token = await adminToken();
    clientId = await makeClient(token);
  });

  it("allocates unique, gap-free quote numbers under concurrency", async () => {
    const n = 12;
    const results = await fireConcurrent(
      token,
      clientId,
      n,
      createQuote,
      (i) => quoteBody(clientId, `Item ${i}`),
    );
    for (const r of results) expect(r.status).toBe(201);

    const numbers = results.map((r) => (r.body!.quote as { number: string }).number);
    for (const num of numbers) expect(num).toMatch(/^Q-\d{4}-\d{4}$/);

    const seq = sequenceOf(numbers);
    expect(new Set(seq).size).toBe(n); // no duplicates
    expect(Math.min(...seq)).toBe(1); // starts at 0001
    expect([...seq].sort((a, b) => a - b)).toEqual(
      Array.from({ length: n }, (_, i) => i + 1),
    ); // gap-free 1..n
  });

  it("allocates unique, gap-free invoice numbers under concurrency", async () => {
    const n = 12;
    const results = await fireConcurrent(
      token,
      clientId,
      n,
      createInvoice,
      () => ({
        clientId,
        items: [{ description: "Invoice line", qty: 1, unitPrice: 25 }],
      }),
    );
    for (const r of results) expect(r.status).toBe(201);

    const numbers = results.map(
      (r) => (r.body!.invoice as { number: string }).number,
    );
    for (const num of numbers) expect(num).toMatch(/^INV-\d{4}-\d{4}$/);

    const seq = sequenceOf(numbers);
    expect(new Set(seq).size).toBe(n);
    expect(Math.min(...seq)).toBe(1);
    expect([...seq].sort((a, b) => a - b)).toEqual(
      Array.from({ length: n }, (_, i) => i + 1),
    );
  });

  it("keeps quote and invoice numbering independent", async () => {
    const [q1, q2] = await Promise.all([
      api(createQuote, { token, method: "POST", body: quoteBody(clientId, "A") }),
      api(createInvoice, {
        token,
        method: "POST",
        body: { clientId, items: [{ description: "B", qty: 1, unitPrice: 1 }] },
      }),
    ]);
    expect(q1.status).toBe(201);
    expect(q2.status).toBe(201);
    const qn = (q1.body!.quote as { number: string }).number;
    const inum = (q2.body!.invoice as { number: string }).number;
    expect(qn.startsWith("Q-")).toBe(true);
    expect(inum.startsWith("INV-")).toBe(true);
  });
});
