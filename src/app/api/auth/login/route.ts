import { NextResponse, type NextRequest } from "next/server";
import { randomBytes } from "node:crypto";
import { googleAuthUrl } from "@/lib/auth/google";

export async function GET(req: NextRequest) {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || !process.env.ALLOWED_EMAIL) {
    return NextResponse.redirect(new URL("/login?error=config", req.nextUrl.origin));
  }
  const state = randomBytes(16).toString("hex");
  const redirectUri = `${req.nextUrl.origin}/api/auth/callback`;
  const res = NextResponse.redirect(googleAuthUrl(state, redirectUri));
  res.cookies.set("oauth_state", state, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 600,
  });
  return res;
}
