import "server-only";
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb, schema, type DB } from "@/db/client";
import { needsChecking, oneLetterNeighbours, suggestAirportFix } from "./airport-fix";
import { derive } from "./enrich";
import { unionNames, type FlightState } from "./reconcile";
import { rematchPassengers } from "./rematch";

const depA = alias(schema.airports, "dep_a");
const arrA = alias(schema.airports, "arr_a");

export type AirportFix = { code: string; note: string };

async function airportRow(db: DB, iata: string) {
  const [a] = await db.select().from(schema.airports).where(eq(schema.airports.iata, iata));
  return a ?? null;
}

/**
 * If `code` is unknown or has no airline service, returns the one-letter correction that fits best
 * (same flight elsewhere, same country as the other end, airports you use), or null.
 */
export async function resolveAirport(
  db: DB, userId: string, code: string, otherCode: string, flightNumber: string, depDate: string, end: "dep" | "arr",
): Promise<AirportFix | null> {
  const a = await airportRow(db, code);
  if (!needsChecking(a)) return null;
  const candidates = await db
    .select({ iata: schema.airports.iata, country: schema.airports.country, scheduled: schema.airports.scheduled })
    .from(schema.airports)
    .where(and(inArray(schema.airports.iata, oneLetterNeighbours(code)), eq(schema.airports.scheduled, true)));
  if (!candidates.length) return null;
  const other = await airportRow(db, otherCode);
  const col = end === "dep" ? schema.flights.depIata : schema.flights.arrIata;
  const same = await db
    .select({ code: col })
    .from(schema.flights)
    .where(and(eq(schema.flights.userId, userId), eq(schema.flights.flightNumber, flightNumber), eq(schema.flights.depDate, depDate)));
  const codes = candidates.map((c) => c.iata);
  const usageRows = await db
    .select({ dep: schema.flights.depIata, arr: schema.flights.arrIata })
    .from(schema.flights)
    .where(and(eq(schema.flights.userId, userId), or(inArray(schema.flights.depIata, codes), inArray(schema.flights.arrIata, codes))));
  const usage = new Map<string, number>();
  for (const r of usageRows) for (const c of [r.dep, r.arr]) if (codes.includes(c)) usage.set(c, (usage.get(c) ?? 0) + 1);

  const fix = suggestAirportFix(code, { other, candidates, sameFlightCodes: same.map((s) => s.code), usage });
  if (!fix) return null;
  const why = a ? `${code} is ${a.city ?? a.name}, ${a.country}, with no airline service` : `${code} is not a known airport`;
  return { code: fix, note: `Read as ${code} (${why}); corrected to ${fix}` };
}

function stateOf(f: typeof schema.flights.$inferSelect): FlightState {
  return {
    airlineIata: f.airlineIata, airlineName: f.airlineName, flightNumber: f.flightNumber, depIata: f.depIata, arrIata: f.arrIata,
    depDate: f.depDate, schedDepLocal: f.schedDepLocal, schedArrLocal: f.schedArrLocal, seat: f.seat, seats: f.seats ?? [], cabin: f.cabin, pnr: f.pnr,
    passengerName: f.passengerName, passengerNames: f.passengerNames ?? [], aircraftType: f.aircraftType, operatingAirlineIata: f.operatingAirlineIata, operatingAirlineName: f.operatingAirlineName,
    codeshareNumbers: f.codeshareNumbers ?? [], forOthers: f.forOthers,
    cancelled: f.cancelled, statusEmailAt: f.statusEmailAt, timesEmailAt: f.timesEmailAt, confidence: f.confidence,
    userConfirmed: f.userConfirmed,
  };
}

/**
 * Fixes saved flights whose airport codes look misread. When the corrected flight already exists
 * (another email had it right), the bad copy is merged into it: sources and passenger names move over.
 * Returns how many flights were fixed or merged.
 */
export async function repairAirports(userId: string): Promise<number> {
  const db = await getDb();
  const suspicious = await db
    .select({ f: schema.flights })
    .from(schema.flights)
    .leftJoin(depA, eq(depA.iata, schema.flights.depIata))
    .leftJoin(arrA, eq(arrA.iata, schema.flights.arrIata))
    .where(and(
      eq(schema.flights.userId, userId),
      eq(schema.flights.userConfirmed, false),
      or(isNull(depA.iata), eq(depA.scheduled, false), isNull(arrA.iata), eq(arrA.scheduled, false)),
    ));

  let fixed = 0;
  for (const { f } of suspicious) {
    const depFix = await resolveAirport(db, userId, f.depIata, f.arrIata, f.flightNumber, f.depDate, "dep");
    const arrFix = await resolveAirport(db, userId, f.arrIata, depFix?.code ?? f.depIata, f.flightNumber, f.depDate, "arr");
    if (!depFix && !arrFix) continue;
    const dep = depFix?.code ?? f.depIata, arr = arrFix?.code ?? f.arrIata;

    const [twin] = dep !== f.depIata
      ? await db.select().from(schema.flights).where(and(
          eq(schema.flights.userId, userId), eq(schema.flights.flightNumber, f.flightNumber),
          eq(schema.flights.depDate, f.depDate), eq(schema.flights.depIata, dep),
        ))
      : [];

    if (twin) {
      // The right version already exists: fold this copy into it.
      await db.execute(sql`
        INSERT INTO flight_sources (flight_id, email_message_id, kind)
        SELECT ${twin.id}, email_message_id, kind FROM flight_sources WHERE flight_id = ${f.id}
        ON CONFLICT DO NOTHING`);
      await db.update(schema.flights)
        .set({ passengerNames: unionNames(twin.passengerNames ?? [], f.passengerNames ?? []), updatedAt: new Date() })
        .where(eq(schema.flights.id, twin.id));
      await db.delete(schema.flights).where(eq(schema.flights.id, f.id));
    } else {
      const state = { ...stateOf(f), depIata: dep, arrIata: arr };
      const notes = [depFix?.note, arrFix?.note].filter((n): n is string => !!n);
      const d = derive(state, await airportRow(db, dep), await airportRow(db, arr), notes);
      await db.update(schema.flights)
        .set({ depIata: dep, arrIata: arr, ...d, needsReview: true, updatedAt: new Date() })
        .where(eq(schema.flights.id, f.id));
    }
    fixed++;
  }
  if (fixed) await rematchPassengers(userId);
  return fixed;
}
