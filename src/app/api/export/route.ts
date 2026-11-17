import { NextResponse, type NextRequest } from "next/server";
import { getUser } from "@/lib/auth/session";
import { listFlights } from "@/lib/data";

const COLS = [
  "depDate", "flightNumber", "airlineName", "depIata", "arrIata", "schedDepLocal", "schedArrLocal", "status",
  "distanceKm", "durationMin", "seat", "seats", "mySeat", "cabin", "pnr", "aircraftType", "passengerName", "passengerNames", "operatingAirlineIata", "operatingAirlineName", "codeshareNumbers", "forOthers", "source",
] as const;

export async function GET(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const flights = (await listFlights(user.id)).reverse();
  if (req.nextUrl.searchParams.get("format") === "json") {
    const rows = flights.map((f) => Object.fromEntries(COLS.map((c) => [c, f[c]])));
    return new NextResponse(JSON.stringify(rows, null, 2), {
      headers: { "content-type": "application/json", "content-disposition": 'attachment; filename="contrail-flights.json"' },
    });
  }
  const esc = (v: unknown): string => (Array.isArray(v) ? esc(v.map((x) => (typeof x === "object" && x ? `${(x as { seat?: string }).seat ?? ""}${(x as { name?: string }).name ? ` ${(x as { name?: string }).name}` : ""}` : String(x))).join("; ")) : v == null ? "" : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const csv = [COLS.join(","), ...flights.map((f) => COLS.map((c) => esc(f[c])).join(","))].join("\n");
  return new NextResponse(csv, {
    headers: { "content-type": "text/csv", "content-disposition": 'attachment; filename="contrail-flights.csv"' },
  });
}
