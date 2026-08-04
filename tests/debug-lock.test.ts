import { randomUUID } from "node:crypto";

import { like, sql } from "drizzle-orm";
import { describe, it } from "vitest";

import { db } from "@/lib/db";
import { crmClients, crmQuotes } from "@/lib/db/schema";

describe("MAX query parts", () => {
  it("tests substring and cast", async () => {
    const [client] = await db
      .insert(crmClients)
      .values({ id: randomUUID(), name: "C", status: "lead" })
      .returning();
    await db.insert(crmQuotes).values({
      number: "Q-2026-0001",
      clientId: client.id,
      status: "draft",
      taxRate: 0,
      subtotalCents: 1000,
      taxCents: 0,
      totalCents: 1000,
    });

    const prefix = "Q-2026-";
    const start = prefix.length + 1;
    const rows = await db
      .select({
        number: crmQuotes.number,
        sub: sql<string>`SUBSTRING(${crmQuotes.number} FROM ${start})`,
        cast: sql<number>`CAST(SUBSTRING(${crmQuotes.number} FROM ${start}) AS INTEGER)`,
      })
      .from(crmQuotes)
      .where(like(crmQuotes.number, `${prefix}%`));
    console.log("ROWS:", JSON.stringify(rows));
  });
});
