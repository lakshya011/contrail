import "server-only";
import { cache } from "react";
import { asc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb, schema } from "@/db/client";
import type { Airport, Flight, User } from "@/db/schema";
import { canonicalAirlineNames } from "@/lib/airlines";
import { findClashes, type Clash } from "@/lib/stats/clashes";
import { mySeat } from "@/lib/seats";

export type FlightStatus = "upcoming" | "flown" | "cancelled";
export type FlightWithAirports = Flight & { dep: Airport | null; arr: Airport | null; status: FlightStatus; mySeat: string | null };

export function flightStatus(f: Pick<Flight, "cancelled" | "schedDepUtc" | "depDate">, now = new Date()): FlightStatus {
  if (f.cancelled) return "cancelled";
  const dep = f.schedDepUtc ?? new Date(`${f.depDate}T23:59:59Z`);
  return dep.getTime() <= now.getTime() ? "flown" : "upcoming";
}

const depA = alias(schema.airports, "dep_airport");
const arrA = alias(schema.airports, "arr_airport");

/** Newest first: by departure date, then departure time. */
const newestFirst = (a: Flight, b: Flight) =>
  b.depDate.localeCompare(a.depDate) || (b.schedDepLocal ?? "").localeCompare(a.schedDepLocal ?? "");

/**
 * Everything a page needs about your flights, loaded once per page view with the queries running in parallel
 * (a few hundred rows at most), then filtered in memory. The layout and the page share this result, so a tab
 * switch costs one database round trip instead of about ten.
 */
const loadUserFlights = cache(async (userId: string) => {
  const db = await getDb();
  const [rows, nameRows, opRows, aliasRows] = await Promise.all([
    db.select({ f: schema.flights, dep: depA, arr: arrA })
      .from(schema.flights)
      .leftJoin(depA, eq(depA.iata, schema.flights.depIata))
      .leftJoin(arrA, eq(arrA.iata, schema.flights.arrIata))
      .where(eq(schema.flights.userId, userId)),
    db.select({ code: schema.flights.airlineIata, name: schema.flights.airlineName, n: sql<number>`count(*)::int` })
      .from(schema.flights).where(eq(schema.flights.userId, userId))
      .groupBy(schema.flights.airlineIata, schema.flights.airlineName),
    db.select({ code: schema.flights.operatingAirlineIata, name: schema.flights.operatingAirlineName, n: sql<number>`count(*)::int` })
      .from(schema.flights).where(eq(schema.flights.userId, userId))
      .groupBy(schema.flights.operatingAirlineIata, schema.flights.operatingAirlineName),
    db.select().from(schema.passengerAliases).where(eq(schema.passengerAliases.userId, userId)),
  ]);
  const names = canonicalAirlineNames([...nameRows, ...opRows].map((r) => ({ ...r, n: Number(r.n) })));
  const aliases = aliasRows.map((a) => a.name);
  const now = new Date();
  const flights: FlightWithAirports[] = rows
    .map((r) => ({
      ...r.f,
      airlineName: (r.f.airlineIata && names.get(r.f.airlineIata)) || r.f.airlineName,
      operatingAirlineName: (r.f.operatingAirlineIata && names.get(r.f.operatingAirlineIata)) || r.f.operatingAirlineName,
      dep: r.dep, arr: r.arr, status: flightStatus(r.f, now),
      mySeat: mySeat(r.f.seats ?? [], aliases, r.f.seat),
    }))
    .sort(newestFirst);
  return { flights, aliasRows };
});

const visible = (fs: FlightWithAirports[]) => fs.filter((f) => !f.hidden);

function matches(f: FlightWithAirports, q: string): boolean {
  const needle = q.toLowerCase();
  const compact = needle.replace(/\s/g, "");
  const fields = [
    f.depIata, f.arrIata, f.airlineName, f.operatingAirlineName, f.pnr, f.dep?.city, f.arr?.city, f.dep?.name, f.arr?.name,
  ];
  if ([f.flightNumber, ...(f.codeshareNumbers ?? [])].some((n) => n.toLowerCase().includes(compact))) return true;
  return fields.some((v) => v?.toLowerCase().includes(needle));
}

export async function listFlights(userId: string, opts: { q?: string; year?: string } = {}): Promise<FlightWithAirports[]> {
  let fs = visible((await loadUserFlights(userId)).flights);
  if (opts.year && /^\d{4}$/.test(opts.year)) fs = fs.filter((f) => f.depDate.startsWith(opts.year!));
  if (opts.q?.trim()) fs = fs.filter((f) => matches(f, opts.q!.trim()));
  return fs;
}

export async function getFlight(userId: string, id: string) {
  const db = await getDb();
  const [{ flights }, sources] = await Promise.all([
    loadUserFlights(userId),
    db.select({ e: schema.emailMessages, kind: schema.flightSources.kind })
      .from(schema.flightSources)
      .innerJoin(schema.emailMessages, eq(schema.emailMessages.id, schema.flightSources.emailMessageId))
      .innerJoin(schema.flights, eq(schema.flights.id, schema.flightSources.flightId))
      .where(sql`${schema.flightSources.flightId} = ${id} AND ${schema.flights.userId} = ${userId}`)
      .orderBy(asc(schema.emailMessages.date)),
  ]);
  const flight = flights.find((f) => f.id === id);
  return flight ? { flight, sources } : null;
}

export type ReviewFlight = FlightWithAirports & { clash?: Clash };

/** Flights the importer was unsure about, plus flights that clash with each other (see clashes.ts). */
export async function reviewFlights(userId: string): Promise<ReviewFlight[]> {
  const all = visible((await loadUserFlights(userId)).flights);
  const clashes = findClashes(all.filter((f) => !f.cancelled && !f.forOthers));
  return all
    .filter((f) => f.needsReview || clashes.has(f.id))
    .map((f) => ({ ...f, clash: clashes.get(f.id) }));
}

/** Flights that count towards the Passport: flown, not hidden, and yours (unless you include others). Oldest first. */
export async function passportFlights(user: User): Promise<FlightWithAirports[]> {
  const all = visible((await loadUserFlights(user.id)).flights);
  return all.filter((f) => f.status === "flown" && (user.includeOthers || !f.forOthers)).reverse();
}

export async function flightYears(userId: string): Promise<string[]> {
  const years = new Set(visible((await loadUserFlights(userId)).flights).map((f) => f.depDate.slice(0, 4)));
  return [...years].sort().reverse();
}

export async function getAliases(userId: string) {
  return (await loadUserFlights(userId)).aliasRows;
}
