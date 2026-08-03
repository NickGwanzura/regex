// Runs inside the Next.js server process at startup, so it can use the
// bundled `postgres` driver (unlike a standalone script).
// 1. Applies pending Drizzle migrations (drizzle/*.sql), tracked in
//    _applied_migrations.
// 2. Seeds the admin user if it does not exist (env-driven credentials).
import { randomBytes, scrypt } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import postgres from "postgres";

const DB_URL = process.env.DATABASE_URL;

// Matches @better-auth/utils/password node implementation exactly:
// scrypt N=16384, r=16, p=1, dkLen=64, format `${salt}:${hex(key)}`
function hashPassword(password: string): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const salt = randomBytes(16).toString("hex");
    scrypt(
      password.normalize("NFKC"),
      salt,
      64,
      { N: 16384, r: 16, p: 1, maxmem: 128 * 16384 * 16 * 2 },
      (err, key) => {
        if (err) reject(err);
        else resolvePromise(`${salt}:${key.toString("hex")}`);
      },
    );
  });
}

async function runMigrations(sql: ReturnType<typeof postgres>) {
  await sql`
    create table if not exists _applied_migrations (
      name text primary key
    )
  `;

  const migrationsDir = resolve(process.cwd(), "drizzle");
  const files = (await readdir(migrationsDir))
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const applied = await sql`
      select 1 from _applied_migrations where name = ${file}
    `;
    if (applied.length > 0) continue;

    const content = await readFile(join(migrationsDir, file), "utf8");
    const statements = content
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean);

    for (const statement of statements) {
      await sql.unsafe(statement);
    }

    await sql`
      insert into _applied_migrations (name) values (${file})
    `;
    console.log(`[db-init] applied migration ${file}`);
  }
}

async function seedAdmin(sql: ReturnType<typeof postgres>) {
  const email = (process.env.SEED_ADMIN_EMAIL || "").trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !password) {
    console.log("[db-init] seed env vars missing, skipping seed");
    return;
  }

  const existing = await sql`select id from "user" where email = ${email}`;
  if (existing.length > 0) {
    console.log(`[db-init] admin user ${email} already exists, skipping`);
    return;
  }

  const id = randomBytes(16).toString("hex");
  const now = new Date();
  const passwordHash = await hashPassword(password);
  const name = process.env.SEED_ADMIN_NAME || "Chirimuta";

  await sql`
    insert into "user" (
      id, name, email, "emailVerified", role, "createdAt", "updatedAt"
    ) values (
      ${id}, ${name}, ${email}, true, 'admin', ${now}, ${now}
    )
  `;
  await sql`
    insert into "account" (
      id, "accountId", "providerId", "userId",
      password, "createdAt", "updatedAt"
    ) values (
      ${id}, ${id}, 'credential', ${id},
      ${passwordHash}, ${now}, ${now}
    )
  `;
  console.log(`[db-init] created admin user ${email} (role=admin)`);
}

export async function register() {
  // Only in the Node server runtime, at runtime (not during `next build`).
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  if (!DB_URL) return;

  const sql = postgres(DB_URL, { max: 1 });
  try {
    await runMigrations(sql);
    await seedAdmin(sql);
  } catch (err) {
    console.error("[db-init] failed:", err);
  } finally {
    await sql.end();
  }
}
