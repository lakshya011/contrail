import { NextResponse, type NextRequest } from "next/server";
import { isNotNull } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { runSync } from "@/lib/ingest/pipeline";

export const maxDuration = 300;

/** Called by Vercel Cron. Continues the backfill or picks up new flight emails. */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const db = await getDb();
  const users = await db.select().from(schema.users).where(isNotNull(schema.users.googleRefreshToken));
  const results = [];
  for (const u of users) results.push({ user: u.id, ...(await runSync(u, 270_000 / users.length)) });
  return NextResponse.json({ results });
}
