import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import type { User } from "@/db/schema";

const COOKIE = "contrail_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET must be set (32+ chars)");
  return new TextEncoder().encode(s);
}

export async function createSession(userId: string) {
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function destroySession() {
  (await cookies()).delete(COOKIE);
}

async function sessionUserId(): Promise<string | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) {
    if (process.env.NODE_ENV !== "production") console.warn("[auth] no session cookie on request");
    return null;
  }
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload.sub ?? null;
  } catch (e) {
    if (process.env.NODE_ENV !== "production") console.warn(`[auth] session cookie rejected: ${(e as Error).message}`);
    return null;
  }
}

/** Current user or null (for API routes). */
export async function getUser(): Promise<User | null> {
  const id = await sessionUserId();
  if (!id) return null;
  const db = await getDb();
  const [u] = await db.select().from(schema.users).where(eq(schema.users.id, id)).limit(1);
  if (!u && process.env.NODE_ENV !== "production") console.warn("[auth] session points to a user that does not exist");
  return u ?? null;
}

/** Current user, or redirect to /login (for pages and server actions). */
export async function requireUser(): Promise<User> {
  const u = await getUser();
  if (!u) redirect("/login");
  return u;
}
