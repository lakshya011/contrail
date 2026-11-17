import "./env";
import { mkdirSync } from "node:fs";

async function main() {
  if (process.env.DATABASE_URL) {
    const { neon } = await import("@neondatabase/serverless");
    const { drizzle } = await import("drizzle-orm/neon-http");
    const { migrate } = await import("drizzle-orm/neon-http/migrator");
    await migrate(drizzle(neon(process.env.DATABASE_URL)), { migrationsFolder: "drizzle" });
    console.log("Migrated Neon database");
  } else {
    const dir = process.env.PGLITE_DIR ?? `${process.cwd()}/.data/pglite`;
    mkdirSync(dir, { recursive: true });
    const { PGlite } = await import("@electric-sql/pglite");
    const { drizzle } = await import("drizzle-orm/pglite");
    const { migrate } = await import("drizzle-orm/pglite/migrator");
    const client = new PGlite(dir);
    await migrate(drizzle(client), { migrationsFolder: "drizzle" });
    await client.close();
    console.log(`Migrated local PGlite database at ${dir}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
