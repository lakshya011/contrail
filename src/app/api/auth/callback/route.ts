import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { exchangeCode, GMAIL_SCOPE, isAllowedEmail } from "@/lib/auth/google";
import { createSession } from "@/lib/auth/session";
import { encrypt } from "@/lib/crypto";

export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const fail = (error: string) => NextResponse.redirect(new URL(`/login?error=${error}`, url.origin));
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state || state !== req.cookies.get("oauth_state")?.value) return fail("state");

  const t = await exchangeCode(code, `${url.origin}/api/auth/callback`);
  if (!t.email || !t.emailVerified || !isAllowedEmail(t.email)) return fail("not_allowed");
  if (!t.scope.split(" ").includes(GMAIL_SCOPE)) return fail("scope");

  const db = await getDb();
  const [existing] = await db.select().from(schema.users).where(eq(schema.users.email, t.email));
  const id = existing?.id ?? crypto.randomUUID();
  const token = t.refresh_token ? encrypt(t.refresh_token) : existing?.googleRefreshToken ?? null;
  if (existing) {
    await db.update(schema.users).set({ name: t.name, image: t.picture, googleRefreshToken: token }).where(eq(schema.users.id, id));
  } else {
    await db.insert(schema.users).values({ id, email: t.email, name: t.name, image: t.picture, googleRefreshToken: token });
    if (t.name) await db.insert(schema.passengerAliases).values({ userId: id, name: t.name });
  }
  await db.insert(schema.gmailSync).values({ userId: id }).onConflictDoNothing();

  await createSession(id);
  const res = NextResponse.redirect(new URL(existing ? "/" : "/settings?welcome=1", url.origin));
  res.cookies.delete("oauth_state");
  return res;
}
