import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import type { Airport } from "@/db/schema";
import { applyExtraction } from "@/lib/ingest/pipeline";
import type { ExtractedLeg } from "@/lib/ingest/types";
import { estimateDurationMin, haversineKm } from "@/lib/geo/distance";
import { localToUtc, utcToLocal } from "@/lib/time";

const DEMO_EMAIL = "demo@contrail.local";
const DEMO_NAME = "Alex Demo";

// [airline, number, from, to, weight]
const ROUTES: [string, string, string, string, number][] = [
  ["6E", "2131", "DEL", "BOM", 6], ["6E", "5302", "BOM", "DEL", 6], ["AI", "503", "BLR", "DEL", 5],
  ["AI", "504", "DEL", "BLR", 5], ["UK", "851", "BLR", "BOM", 3], ["6E", "6127", "BOM", "GOI", 2],
  ["6E", "6128", "GOI", "BOM", 2], ["6E", "2003", "DEL", "IXL", 1], ["AI", "175", "BLR", "SFO", 2],
  ["AI", "176", "SFO", "BLR", 2], ["UA", "1452", "SFO", "SEA", 2], ["UA", "1453", "SEA", "SFO", 2],
  ["EK", "511", "DEL", "DXB", 2], ["EK", "3", "DXB", "LHR", 1], ["EK", "4", "LHR", "DXB", 1],
  ["SQ", "423", "BOM", "SIN", 1], ["SQ", "211", "SIN", "SYD", 1], ["SQ", "222", "SYD", "SIN", 1],
  ["AI", "101", "DEL", "JFK", 1], ["UA", "535", "JFK", "SFO", 1], ["6E", "897", "HYD", "BLR", 3],
  ["6E", "616", "BLR", "MAA", 2], ["AF", "225", "DEL", "CDG", 1], ["KL", "1228", "CDG", "AMS", 1],
  ["6E", "6512", "CCU", "DEL", 2], ["6E", "1704", "DEL", "JAI", 2], ["QR", "571", "DEL", "DOH", 1],
  ["QR", "1", "DOH", "LHR", 1],
];

function rng(seed: number) {
  return () => ((seed = (seed * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32);
}

/** Creates (once) a demo user with ~80 flights from 2016 to 2027, built through the real merge pipeline. */
export async function ensureDemoUser(): Promise<string> {
  const db = await getDb();
  const [existing] = await db.select().from(schema.users).where(eq(schema.users.email, DEMO_EMAIL));
  if (existing) return existing.id;

  const id = crypto.randomUUID();
  await db.insert(schema.users).values({ id, email: DEMO_EMAIL, name: DEMO_NAME, homeAirport: "BLR" });
  await db.insert(schema.passengerAliases).values({ userId: id, name: DEMO_NAME });

  const cache = new Map<string, Airport | null>();
  const airport = async (iata: string) => {
    if (!cache.has(iata)) {
      const [a] = await db.select().from(schema.airports).where(eq(schema.airports.iata, iata));
      cache.set(iata, a ?? null);
    }
    return cache.get(iata) ?? null;
  };

  const rand = rng(42);
  const weighted = ROUTES.flatMap((r) => Array(r[4]).fill(r) as typeof ROUTES);
  const seats = ["3A", "12F", "21C", "14D", "7A", "28B", "17K", "33E", "9A", "22C"];
  const start = Date.UTC(2016, 2, 1), end = Date.UTC(2027, 1, 15);

  for (let i = 0; i < 84; i++) {
    const [code, num, from, to] = weighted[Math.floor(rand() * weighted.length)];
    const day = new Date(start + rand() * (end - start)).toISOString().slice(0, 10);
    const hour = String(Math.floor(rand() * 24)).padStart(2, "0");
    const min = ["00", "15", "30", "45"][Math.floor(rand() * 4)];
    const [dep, arr] = await Promise.all([airport(from), airport(to)]);
    if (!dep || !arr) continue;
    const depLocal = `${day}T${hour}:${min}`;
    const depUtc = localToUtc(depLocal, dep.tz)!;
    const arrLocal = utcToLocal(
      new Date(depUtc.getTime() + estimateDurationMin(haversineKm(dep.lat, dep.lon, arr.lat, arr.lon)) * 60000),
      arr.tz,
    );
    const longHaul = haversineKm(dep.lat, dep.lon, arr.lat, arr.lon) > 4000;
    const leg: ExtractedLeg = {
      airlineIata: code, airlineName: null, flightNumber: `${code} ${num}`, depIata: from, arrIata: to,
      depDate: day, depTime: `${hour}:${min}`, arrDate: arrLocal.slice(0, 10), arrTime: arrLocal.slice(11),
      pnr: Math.floor(rand() * 36 ** 6).toString(36).toUpperCase().padStart(6, "X"),
      seat: seats[Math.floor(rand() * seats.length)],
      cabin: longHaul && rand() < 0.3 ? "business" : rand() < 0.05 ? "premium_economy" : "economy",
      passengers: [i % 23 === 5 ? "Priya Sharma" : `${DEMO_NAME.split(" ")[1].toUpperCase()}/${DEMO_NAME.split(" ")[0].toUpperCase()} MR`],
      aircraftType: longHaul ? (rand() < 0.5 ? "Boeing 777-300ER" : "Airbus A350-900") : rand() < 0.6 ? "Airbus A320neo" : "Boeing 737-800",
      operatedBy: null,
    };
    const emailAt = new Date(Date.parse(day) - 20 * 864e5);
    await applyExtraction(db, id, null, { emailKind: "booking", legs: [leg], confidence: 0.92 }, emailAt, [DEMO_NAME], airport);
    if (i % 19 === 7) {
      await applyExtraction(db, id, null, { emailKind: "cancellation", legs: [leg], confidence: 0.9 }, new Date(emailAt.getTime() + 5 * 864e5), [DEMO_NAME], airport);
    }
  }
  // One that needs review: an unknown airport code.
  await applyExtraction(db, id, null, {
    emailKind: "booking", confidence: 0.55,
    legs: [{ airlineIata: "6E", airlineName: null, flightNumber: "6E 999", depIata: "BLR", arrIata: "XQZ", depDate: "2019-07-14", depTime: "06:10", arrDate: null, arrTime: "08:00", pnr: "QWERTY", seat: null, cabin: "economy", passengers: [DEMO_NAME], aircraftType: null, operatedBy: null }],
  }, new Date("2019-06-30"), [DEMO_NAME], airport);

  await db.update(schema.flights).set({ source: "demo" }).where(and(eq(schema.flights.userId, id), eq(schema.flights.source, "email")));
  return id;
}
