import { NextResponse, type NextRequest } from "next/server";
import { createSession } from "@/lib/auth/session";
import { ensureDemoUser } from "@/lib/demo";

/** Local preview only: signs in as a demo user with sample flights. Disabled unless DEMO_MODE=1. */
export async function GET(req: NextRequest) {
  if (process.env.DEMO_MODE !== "1") return new NextResponse("Not found", { status: 404 });
  const id = await ensureDemoUser();
  await createSession(id);
  return NextResponse.redirect(new URL("/", req.nextUrl.origin));
}
