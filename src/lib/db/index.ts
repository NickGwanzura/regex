import "server-only";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

const connectionString =
  process.env.DATABASE_URL ||
  "postgres://postgres:postgres@localhost:5432/regex";

const client = postgres(connectionString, { max: 10, prepare: false });

export const db = drizzle(client, { schema });

export * from "./schema";
