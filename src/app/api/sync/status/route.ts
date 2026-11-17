import { NextResponse, type NextRequest } from "next/server";
import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { getProgress } from "@/lib/ingest/pipeline";

/** Import progress for every connected user, for monitoring. Requires the CRON_SECRET bearer token. */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const db = await getDb();
  const users = await db.select({ id: schema.users.id }).from(schema.users).where(isNotNull(schema.users.googleRefreshToken));
  return NextResponse.json(await Promise.all(users.map(async (u) => ({
    userId: u.id,
    ...(await getProgress(u.id)),
    // Most common error messages, to diagnose failures without opening the database.
    topErrors: await db
      .select({ error: sql<string>`left(regexp_replace(${schema.emailMessages.error}, '/messages/[A-Za-z0-9]+', '/messages/…', 'g'), 200)`, n: sql<number>`count(*)::int` })
      .from(schema.emailMessages)
      .where(and(eq(schema.emailMessages.userId, u.id), eq(schema.emailMessages.status, "error")))
      .groupBy(sql`1`)
      .orderBy(desc(sql`count(*)`))
      .limit(5),
  }))));
}
