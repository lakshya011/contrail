/**
 * One-off: copy your data from the local embedded database (./.data/pglite) into the production Neon database.
 * The Neon address is read from .env.neon only (one line: DATABASE_URL=...), so local settings stay untouched.
 * Safe to re-run: rows that already exist are skipped. The sample/demo account is not copied.
 *
 *   npx tsx scripts/copy-local-to-neon.ts
 *
 * Stop `npm run dev` first: the local database can only be opened by one program at a time.
 */
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzleLocal } from "drizzle-orm/pglite";
import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";
import { inArray, ne, sql, type SQL } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import * as schema from "../src/db/schema";

const DEMO_EMAIL = "demo@contrail.local";

function neonUrl(): string {
  const line = readFileSync(".env.neon", "utf8").split("\n").find((l) => l.trim().startsWith("DATABASE_URL="));
  if (!line) throw new Error(".env.neon must contain a DATABASE_URL=... line");
  return line.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
}

async function copy<T extends PgTable>(label: string, remote: ReturnType<typeof drizzleNeon>, table: T, rows: T["$inferInsert"][], size = 250) {
  for (let i = 0; i < rows.length; i += size) {
    await remote.insert(table).values(rows.slice(i, i + size)).onConflictDoNothing();
    process.stdout.write(`\r  ${label}: ${Math.min(i + size, rows.length)}/${rows.length}`);
  }
  console.log(rows.length ? "" : `  ${label}: 0/0`);
}

async function count(db: { execute: (q: SQL) => Promise<unknown> }, q: SQL): Promise<number> {
  const res = (await db.execute(q)) as { rows: { n: number | string }[] };
  return Number(res.rows[0].n);
}

async function main() {
  const local = drizzleLocal(new PGlite(`${process.cwd()}/.data/pglite`), { schema });
  const remote = drizzleNeon(neon(neonUrl()), { schema });

  console.log("1. Creating tables in Neon…");
  await migrate(remote, { migrationsFolder: "drizzle" });

  console.log("2. Reference data");
  await copy("airports", remote, schema.airports, await local.select().from(schema.airports), 500);
  await copy("airlines", remote, schema.airlines, await local.select().from(schema.airlines), 500);

  console.log("3. Your account (sample account skipped)");
  const users = await local.select().from(schema.users).where(ne(schema.users.email, DEMO_EMAIL));
  if (!users.length) throw new Error("No real account found locally. Sign in with Google on this Mac first.");
  const ids = users.map((u) => u.id);
  await copy("users", remote, schema.users, users);
  await copy("names on tickets", remote, schema.passengerAliases, await local.select().from(schema.passengerAliases).where(inArray(schema.passengerAliases.userId, ids)));
  await copy("gmail sync state", remote, schema.gmailSync, await local.select().from(schema.gmailSync).where(inArray(schema.gmailSync.userId, ids)));
  await copy("email records", remote, schema.emailMessages, await local.select().from(schema.emailMessages).where(inArray(schema.emailMessages.userId, ids)), 500);
  const flights = await local.select().from(schema.flights).where(inArray(schema.flights.userId, ids));
  await copy("flights", remote, schema.flights, flights, 100);
  const flightIds = flights.map((f) => f.id);
  const sources = flightIds.length ? await local.select().from(schema.flightSources).where(inArray(schema.flightSources.flightId, flightIds)) : [];
  await copy("flight ↔ email links", remote, schema.flightSources, sources, 500);

  // Serial ids were copied as-is; move the counters past them so new rows don't collide.
  await remote.execute(sql`SELECT setval(pg_get_serial_sequence('email_messages', 'id'), GREATEST((SELECT max(id) FROM email_messages), 1))`);
  await remote.execute(sql`SELECT setval(pg_get_serial_sequence('passenger_aliases', 'id'), GREATEST((SELECT max(id) FROM passenger_aliases), 1))`);

  console.log("4. Checking counts (local → Neon)");
  const inList = sql.join(ids.map((id) => sql`${id}`), sql`, `);
  const checks: [string, SQL][] = [
    ["airports", sql`SELECT count(*) n FROM airports`],
    ["airlines", sql`SELECT count(*) n FROM airlines`],
    ["email records", sql`SELECT count(*) n FROM email_messages WHERE user_id IN (${inList})`],
    ["flights", sql`SELECT count(*) n FROM flights WHERE user_id IN (${inList})`],
    ["flown, yours", sql`SELECT count(*) n FROM flights WHERE user_id IN (${inList}) AND NOT cancelled AND NOT hidden AND NOT for_others`],
    ["links", sql`SELECT count(*) n FROM flight_sources fs JOIN flights f ON f.id = fs.flight_id WHERE f.user_id IN (${inList})`],
  ];
  let ok = true;
  for (const [label, q] of checks) {
    const [a, b] = [await count(local, q), await count(remote, q)];
    if (a !== b) ok = false;
    console.log(`  ${a === b ? "✓" : "✗"} ${label}: ${a} → ${b}`);
  }
  console.log(ok ? "All counts match." : "Some counts differ: re-run the script, it only adds what's missing.");
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
