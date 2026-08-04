import { beforeEach, describe, expect, it } from "vitest";

import {
  GET as listClients,
  POST as createClient,
} from "@/app/api/crm/clients/route";
import {
  DELETE as deleteClient,
  GET as getClient,
  PATCH as patchClient,
} from "@/app/api/crm/clients/[id]/route";
import { POST as createContact } from "@/app/api/crm/contacts/route";
import {
  DELETE as deleteContact,
  PATCH as patchContact,
} from "@/app/api/crm/contacts/[id]/route";
import { POST as createInstallation } from "@/app/api/crm/installations/route";
import {
  DELETE as deleteInstallation,
  PATCH as patchInstallation,
} from "@/app/api/crm/installations/[id]/route";
import { POST as createQuote } from "@/app/api/crm/quotes/route";

import { adminToken, api, resetDb } from "./helpers";

async function makeClient(token: string, overrides: Record<string, unknown> = {}) {
  const res = await api(createClient, {
    token,
    method: "POST",
    body: { name: "Acme Corp", ...overrides },
  });
  expect(res.status).toBe(201);
  return res.body!.client as { id: string; name: string; status: string };
}

describe("clients CRUD", () => {
  let token: string;
  beforeEach(async () => {
    await resetDb();
    token = await adminToken();
  });

  it("creates a client with a default status", async () => {
    const res = await api(createClient, {
      token,
      method: "POST",
      body: { name: "  Acme Corp  ", billingEmail: "billing@acme.com" },
    });
    expect(res.status).toBe(201);
    const client = res.body!.client as {
      name: string;
      status: string;
      billingEmail: string;
    };
    expect(client.name).toBe("Acme Corp"); // trimmed
    expect(client.status).toBe("lead");
    expect(client.billingEmail).toBe("billing@acme.com");
  });

  it("rejects a client without a name", async () => {
    const res = await api(createClient, { token, method: "POST", body: {} });
    expect(res.status).toBe(400);
  });

  it("rejects an invalid status", async () => {
    const res = await api(createClient, {
      token,
      method: "POST",
      body: { name: "X", status: "gold" },
    });
    expect(res.status).toBe(400);
  });

  it("rejects a malformed billing email", async () => {
    const res = await api(createClient, {
      token,
      method: "POST",
      body: { name: "X", billingEmail: "not-an-email" },
    });
    expect(res.status).toBe(400);
  });

  it("lists, fetches and updates a client", async () => {
    const client = await makeClient(token);

    const list = await api(listClients, { token });
    expect(list.status).toBe(200);
    expect((list.body!.clients as unknown[]).length).toBe(1);

    const detail = await api(getClient, { token, params: { id: client.id } });
    expect(detail.status).toBe(200);
    expect((detail.body!.client as { id: string }).id).toBe(client.id);

    const patch = await api(patchClient, {
      token,
      method: "PATCH",
      params: { id: client.id },
      body: { name: "Acme Industries", status: "active" },
    });
    expect(patch.status).toBe(200);
    const updated = patch.body!.client as { name: string; status: string };
    expect(updated.name).toBe("Acme Industries");
    expect(updated.status).toBe("active");
  });

  it("deletes a client with no dependents", async () => {
    const client = await makeClient(token);
    const res = await api(deleteClient, {
      token,
      method: "DELETE",
      params: { id: client.id },
    });
    expect(res.status).toBe(200);
    expect(res.body?.deleted).toBe(true);
  });

  it("refuses to delete a client that has installations", async () => {
    const client = await makeClient(token);
    await api(createInstallation, {
      token,
      method: "POST",
      body: {
        clientId: client.id,
        name: "HQ network",
        serviceType: "wireless_rf",
        engagementModel: "build",
      },
    });
    const res = await api(deleteClient, {
      token,
      method: "DELETE",
      params: { id: client.id },
    });
    expect(res.status).toBe(409);
  });
});

describe("contacts CRUD", () => {
  let token: string;
  let clientId: string;
  beforeEach(async () => {
    await resetDb();
    token = await adminToken();
    clientId = (await makeClient(token)).id;
  });

  it("creates, updates and deletes a contact", async () => {
    const created = await api(createContact, {
      token,
      method: "POST",
      body: { clientId, name: "Jane Doe", email: "jane@acme.com", isPrimary: true },
    });
    expect(created.status).toBe(201);
    const contact = created.body!.contact as { id: string; isPrimary: boolean };
    expect(contact.isPrimary).toBe(true);

    const updated = await api(patchContact, {
      token,
      method: "PATCH",
      params: { id: contact.id },
      body: { role: "Facilities" },
    });
    expect(updated.status).toBe(200);
    expect((updated.body!.contact as { role: string }).role).toBe("Facilities");

    const deleted = await api(deleteContact, {
      token,
      method: "DELETE",
      params: { id: contact.id },
    });
    expect(deleted.status).toBe(200);
  });

  it("rejects a contact for a non-existent client", async () => {
    const res = await api(createContact, {
      token,
      method: "POST",
      body: { clientId: "00000000-0000-4000-8000-000000000000", name: "Ghost" },
    });
    expect(res.status).toBe(400);
    expect(res.body?.error).toContain("Client not found");
  });
});

describe("installations CRUD", () => {
  let token: string;
  let clientId: string;
  beforeEach(async () => {
    await resetDb();
    token = await adminToken();
    clientId = (await makeClient(token)).id;
  });

  it("requires serviceType and engagementModel", async () => {
    const res = await api(createInstallation, {
      token,
      method: "POST",
      body: { clientId, name: "HQ" },
    });
    expect(res.status).toBe(400);
    expect(res.body?.error).toContain("serviceType");
  });

  it("creates and updates an installation with money in dollars", async () => {
    const created = await api(createInstallation, {
      token,
      method: "POST",
      body: {
        clientId,
        name: "HQ network",
        serviceType: "wireless_rf",
        engagementModel: "build",
        value: 2500.5,
      },
    });
    expect(created.status).toBe(201);
    const installation = created.body!.installation as {
      id: string;
      value: number;
    };
    expect(installation.value).toBe(2500.5);

    const patched = await api(patchInstallation, {
      token,
      method: "PATCH",
      params: { id: installation.id },
      body: { status: "completed", value: 3000 },
    });
    expect(patched.status).toBe(200);
    const updated = patched.body!.installation as { status: string; value: number };
    expect(updated.status).toBe("completed");
    expect(updated.value).toBe(3000);
  });

  it("refuses to delete an installation referenced by a quote", async () => {
    const created = await api(createInstallation, {
      token,
      method: "POST",
      body: {
        clientId,
        name: "HQ",
        serviceType: "vpn",
        engagementModel: "operate",
      },
    });
    const installation = created.body!.installation as { id: string };
    await api(createQuote, {
      token,
      method: "POST",
      body: {
        clientId,
        installationId: installation.id,
        items: [{ description: "Setup", qty: 1, unitPrice: 500 }],
      },
    });
    const res = await api(deleteInstallation, {
      token,
      method: "DELETE",
      params: { id: installation.id },
    });
    expect(res.status).toBe(409);
  });
});
