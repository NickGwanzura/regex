// Runs at container boot (see docker-entrypoint.sh).
// 1. Applies pending Drizzle migrations (drizzle/*.sql) by executing each
//    statement, tracking applied files in a _applied_migrations table.
// 2. Seeds the admin user if it does not exist (email/password from env).
//
// Uses only the `postgres` driver, which is guaranteed present in the
// standalone runtime image because the app's DB layer imports it.
import { randomBytes, scrypt } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import postgres from "postgres";

const { DATABASE_URL, SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD } = process.env;

if (!DATABASE_URL) {
  console.error("[init] DATABASE_URL not set, skipping migrations + seed");
  process.exit(0);
}

// Matches @better-auth/utils/password node implementation exactly
// (verified against installed better-auth 1.6.x source):
// scrypt N=16384, r=16, p=1, dkLen=64, format `${salt}:${hex(key)}`
function hashPassword(password) {
  return new Promise((resolve, reject) => {
    const salt = randomBytes(16).toString("hex");
    scrypt(
      password.normalize("NFKC"),
      salt,
      64,
      {
        N: 16384,
        r: 16,
        p: 1,
        maxmem: 128 * 16384 * 16 * 2,
      },
      (err, key) => {
        if (err) reject(err);
        else resolve(`${salt}:${key.toString("hex")}`);
      },
    );
  });
}

const sql = postgres(DATABASE_URL, { max: 1 });

const migrationsDir = resolve(
  fileURLToPath(import.meta.url),
  "../../drizzle",
);

async function runMigrations() {
  await sql`
    create table if not exists _applied_migrations (
      name text primary key
    )
  `;

  const files = (await readdir(migrationsDir))
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const applied = await sql`
      select 1 from _applied_migrations where name = ${file}
    `;
    if (applied.length > 0) continue;

    const content = await readFile(resolve(migrationsDir, file), "utf8");
    // drizzle-kit separates statements with this marker
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
    console.log(`[init] applied migration ${file}`);
  }
}

try {
  // --- 1. Migrations -----------------------------------------------------
  console.log("[init] running migrations…");
  await runMigrations();
  console.log("[init] migrations applied");

  // --- 2. Seed admin user ------------------------------------------------
  const email = (SEED_ADMIN_EMAIL || "").trim().toLowerCase();
  if (!email) {
    console.log("[init] SEED_ADMIN_EMAIL not set, skipping seed");
  } else if (!SEED_ADMIN_PASSWORD) {
    console.log("[init] SEED_ADMIN_PASSWORD not set, skipping seed");
  } else {
    const existing = await sql`
      select id from "user" where email = ${email}
    `;
    if (existing.length > 0) {
      console.log(`[init] admin user ${email} already exists, skipping`);
    } else {
      const id = randomBytes(16).toString("hex");
      const now = new Date();
      const passwordHash = await hashPassword(SEED_ADMIN_PASSWORD);
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
      console.log(`[init] created admin user ${email} (role=admin)`);
    }
  }

  console.log("[init] done");
} catch (err) {
  console.error("[init] failed:", err);
  process.exit(1);
} finally {
  await sql.end();
}
