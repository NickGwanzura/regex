import { beforeEach, describe, expect, it } from "vitest";

import { POST as createClient } from "@/app/api/crm/clients/route";
import { POST as createInvoice } from "@/app/api/crm/invoices/route";
import { GET as getInvoice } from "@/app/api/crm/invoices/[id]/route";
import { PATCH as patchInvoice } from "@/app/api/crm/invoices/[id]/route";
import { POST as createPayment } from "@/app/api/crm/payments/route";
import { POST as createQuote } from "@/app/api/crm/quotes/route";
import { GET as getStats } from "@/app/api/crm/stats/route";

import { adminToken, api, resetDb } from "./helpers";

describe("quote → invoice conversion", () => {
  let token: string;
  let clientId: string;

  beforeEach(async () => {
    await resetDb();
    token = await adminToken();
    const client = await api(createClient, {
      token,
      method: "POST",
      body: { name: "BuildCo" },
    });
    clientId = (client.body!.client as { id: string }).id;
  });

  it("copies items, tax and client from an accepted quote", async () => {
    const quoteRes = await api(createQuote, {
      token,
      method: "POST",
      body: {
        clientId,
        items: [
          { description: "Access point", qty: 2, unitPrice: 100 },
          { description: "Switch", qty: 1, unitPrice: 50 },
        ],
        taxRate: 10,
      },
    });
    expect(quoteRes.status).toBe(201);
    const quote = quoteRes.body!.quote as { id: string; total: number };
    expect(quote.total).toBe(275); // (200 + 50) * 1.10
    expect((quoteRes.body!.quote as { number: string }).number).toMatch(
      /^Q-\d{4}-\d{4}$/,
    );

    const invoiceRes = await api(createInvoice, {
      token,
      method: "POST",
      body: { quoteId: quote.id },
    });
    expect(invoiceRes.status).toBe(201);
    const invoice = invoiceRes.body!.invoice as { id: string; total: number };
    expect(invoice.total).toBe(275);
    expect((invoiceRes.body!.invoice as { number: string }).number).toMatch(
      /^INV-\d{4}-\d{4}$/,
    );

    const detail = await api(getInvoice, { token, params: { id: invoice.id } });
    const items = detail.body!.items as {
      description: string;
      qty: number;
      unitPrice: number;
    }[];
    expect(items).toHaveLength(2);
    expect(items[0]).toEqual({ description: "Access point", qty: 2, unitPrice: 100 });
  });

  it("rejects a quote body with no items", async () => {
    const res = await api(createQuote, {
      token,
      method: "POST",
      body: { clientId, items: [] },
    });
    expect(res.status).toBe(400);
  });

  it("rejects an invoice referencing a missing quote", async () => {
    const res = await api(createInvoice, {
      token,
      method: "POST",
      body: { quoteId: "00000000-0000-4000-8000-000000000000" },
    });
    expect(res.status).toBe(400);
    expect(res.body?.error).toContain("Quote not found");
  });
});

describe("payment status recomputation", () => {
  let token: string;
  let invoiceId: string;

  beforeEach(async () => {
    await resetDb();
    token = await adminToken();
    const client = await api(createClient, {
      token,
      method: "POST",
      body: { name: "BuildCo" },
    });
    const clientId = (client.body!.client as { id: string }).id;
    const quote = await api(createQuote, {
      token,
      method: "POST",
      body: {
        clientId,
        items: [{ description: "Install", qty: 1, unitPrice: 1000 }],
        taxRate: 0,
      },
    });
    const quoteId = (quote.body!.quote as { id: string }).id;
    const invoice = await api(createInvoice, {
      token,
      method: "POST",
      body: { quoteId },
    });
    invoiceId = (invoice.body!.invoice as { id: string }).id;
  });

  it("moves an invoice from sent → partial → paid as payments land", async () => {
    const first = await api(createPayment, {
      token,
      method: "POST",
      body: { invoiceId, amount: 300 },
    });
    expect(first.status).toBe(201);

    let detail = await api(getInvoice, { token, params: { id: invoiceId } });
    let invoice = detail.body!.invoice as {
      status: string;
      paid: number;
      balance: number;
    };
    expect(invoice.status).toBe("partial");
    expect(invoice.paid).toBe(300);
    expect(invoice.balance).toBe(700);

    const second = await api(createPayment, {
      token,
      method: "POST",
      body: { invoiceId, amount: 700 },
    });
    expect(second.status).toBe(201);

    detail = await api(getInvoice, { token, params: { id: invoiceId } });
    invoice = detail.body!.invoice as {
      status: string;
      paid: number;
      balance: number;
    };
    expect(invoice.status).toBe("paid");
    expect(invoice.paid).toBe(1000);
    expect(invoice.balance).toBe(0);
  });

  it("rejects payments on a void invoice", async () => {
    await api(patchInvoice, {
      token,
      method: "PATCH",
      params: { id: invoiceId },
      body: { status: "void" },
    });
    const res = await api(createPayment, {
      token,
      method: "POST",
      body: { invoiceId, amount: 100 },
    });
    expect(res.status).toBe(400);
  });

  it("rejects a non-positive payment amount", async () => {
    const res = await api(createPayment, {
      token,
      method: "POST",
      body: { invoiceId, amount: 0 },
    });
    expect(res.status).toBe(400);
  });

  it("reflects paid invoices in the stats endpoint", async () => {
    await api(createPayment, {
      token,
      method: "POST",
      body: { invoiceId, amount: 1000 },
    });
    const stats = await api(getStats, { token });
    expect(stats.status).toBe(200);
    const data = stats.body as { stats: { collectedTotal: number; outstandingTotal: number } };
    expect(data.stats.collectedTotal).toBe(1000);
    expect(data.stats.outstandingTotal).toBe(0);
  });
});
