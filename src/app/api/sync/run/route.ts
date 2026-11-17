import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth/session";
import { getProgress, runSync } from "@/lib/ingest/pipeline";

export const maxDuration = 120;

/** One time-boxed sync pass. The Settings page calls this in a loop until `done`. */
export async function POST() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!user.googleRefreshToken) return NextResponse.json(await getProgress(user.id));
  return NextResponse.json(await runSync(user, 90_000));
}

export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(await getProgress(user.id));
}
