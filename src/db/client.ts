import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";

/**
 * Production: Neon Postgres over HTTP (DATABASE_URL set).
 * Local development: embedded PGlite stored in ./.data/pglite (no Postgres install needed).
 */
export type DB = PgDatabase<PgQueryResultHKT, typeof schema>;

const globalForDb = globalThis as unknown as { __contrailDb?: Promise<DB> };

async function create(): Promise<DB> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const { neon } = await import("@neondatabase/serverless");
    const { drizzle } = await import("drizzle-orm/neon-http");
    return drizzle(neon(url), { schema }) as unknown as DB;
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const dir = process.env.PGLITE_DIR ?? `${process.cwd()}/.data/pglite`;
  const client = new PGlite(dir);
  await client.waitReady; // surface "run npm run setup" problems here so the next call retries
  return drizzle(client, { schema }) as unknown as DB;
}

export function getDb(): Promise<DB> {
  globalForDb.__contrailDb ??= create().catch((e) => {
    globalForDb.__contrailDb = undefined; // retry on the next call
    throw e;
  });
  return globalForDb.__contrailDb;
}

export { schema };
