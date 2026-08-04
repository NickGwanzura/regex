import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import EmbeddedPostgres from "embedded-postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

export const TEST_DB_URL_FILE = join(tmpdir(), "regex-test-db-url.txt");
const MIGRATIONS_FOLDER = join(process.cwd(), "drizzle");

export function getTestDbUrl(): string {
  return readFileSync(TEST_DB_URL_FILE, "utf8").trim();
}

/**
 * Boots a throwaway Postgres cluster (real Postgres via embedded-postgres, or
 * connects to a DATABASE_URL if one is provided) and applies the drizzle
 * migrations so the schema is identical to production.
 */
export default async function () {
  let url = process.env.DATABASE_URL;
  let pg: EmbeddedPostgres | null = null;

  if (!url) {
    const databaseDir = mkdtempSync(join(tmpdir(), "regex-pg-"));
    pg = new EmbeddedPostgres({
      databaseDir,
      port: 54329,
      user: "postgres",
      password: "postgres",
      authMethod: "password",
      persistent: false,
      onLog: () => {},
      onError: () => {},
    });
    await pg.initialise();
    await pg.start();
    await pg.createDatabase("regex_test");
    url = "postgres://postgres:postgres@localhost:54329/regex_test";
  }

  writeFileSync(TEST_DB_URL_FILE, url);

  const client = postgres(url, { max: 1 });
  try {
    await migrate(drizzle(client), { migrationsFolder: MIGRATIONS_FOLDER });
  } finally {
    await client.end();
  }

  return async () => {
    if (pg) await pg.stop();
  };
}
