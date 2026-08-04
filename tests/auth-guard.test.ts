import { beforeEach, describe, expect, it } from "vitest";

import { GET as listClients } from "@/app/api/crm/clients/route";

import { adminToken, api, resetDb, userToken } from "./helpers";

describe("auth guard", () => {
  beforeEach(resetDb);

  it("rejects unauthenticated requests with 401", async () => {
    const res = await api(listClients);
    expect(res.status).toBe(401);
    expect(res.body?.error).toBe("Not authenticated");
  });

  it("rejects non-admin users with 403", async () => {
    const token = await userToken();
    const res = await api(listClients, { token });
    expect(res.status).toBe(403);
    expect(res.body?.error).toBe("Admin access required");
  });

  it("allows admin users through", async () => {
    const token = await adminToken();
    const res = await api(listClients, { token });
    expect(res.status).toBe(200);
    expect(res.body?.clients).toEqual([]);
  });
});
