import "server-only";
import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";
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

/** Display name per airline code for this user (see src/lib/airlines.ts). */
async function airlineNames(userId: string) {
  const db = await getDb();
  const rows = await db
    .select({ code: schema.flights.airlineIata, name: schema.flights.airlineName, n: sql<number>`count(*)::int` })
    .from(schema.flights)
    .where(eq(schema.flights.userId, userId))
    .groupBy(schema.flights.airlineIata, schema.flights.airlineName);
  const opRows = await db
    .select({ code: schema.flights.operatingAirlineIata, name: schema.flights.operatingAirlineName, n: sql<number>`count(*)::int` })
    .from(schema.flights)
    .where(eq(schema.flights.userId, userId))
    .groupBy(schema.flights.operatingAirlineIata, schema.flights.operatingAirlineName);
  return canonicalAirlineNames([...rows, ...opRows].map((r) => ({ ...r, n: Number(r.n) })));
}

async function query(where: ReturnType<typeof and>, order: "asc" | "desc" = "desc", userId?: string) {
  const db = await getDb();
  const names = userId ? await airlineNames(userId) : null;
  const aliases = userId
    ? (await db.select({ name: schema.passengerAliases.name }).from(schema.passengerAliases).where(eq(schema.passengerAliases.userId, userId))).map((a) => a.name)
    : [];
  const rows = await db
    .select({ f: schema.flights, dep: depA, arr: arrA })
    .from(schema.flights)
    .leftJoin(depA, eq(depA.iata, schema.flights.depIata))
    .leftJoin(arrA, eq(arrA.iata, schema.flights.arrIata))
    .where(where)
    .orderBy(order === "desc" ? desc(schema.flights.depDate) : asc(schema.flights.depDate), desc(schema.flights.schedDepLocal));
  const now = new Date();
  return rows.map((r) => ({
    ...r.f,
    airlineName: (r.f.airlineIata && names?.get(r.f.airlineIata)) || r.f.airlineName,
    operatingAirlineName: (r.f.operatingAirlineIata && names?.get(r.f.operatingAirlineIata)) || r.f.operatingAirlineName,
    dep: r.dep, arr: r.arr, status: flightStatus(r.f, now),
    mySeat: mySeat(r.f.seats ?? [], aliases, r.f.seat),
  }));
}

export async function listFlights(userId: string, opts: { q?: string; year?: string } = {}): Promise<FlightWithAirports[]> {
  const conds = [eq(schema.flights.userId, userId), eq(schema.flights.hidden, false)];
  if (opts.year && /^\d{4}$/.test(opts.year)) conds.push(sql`substr(${schema.flights.depDate}, 1, 4) = ${opts.year}`);
  if (opts.q?.trim()) {
    const like = `%${opts.q.trim()}%`;
    conds.push(or(
      ilike(schema.flights.flightNumber, like.replace(/\s/g, "")), ilike(schema.flights.depIata, like),
      sql`${schema.flights.codeshareNumbers}::text ilike ${like.replace(/\s/g, "")}`, ilike(schema.flights.operatingAirlineName, like),
      ilike(schema.flights.arrIata, like), ilike(schema.flights.airlineName, like), ilike(schema.flights.pnr, like),
      ilike(depA.city, like), ilike(arrA.city, like),
    )!);
  }
  return query(and(...conds), "desc", userId);
}

export async function getFlight(userId: string, id: string) {
  const [f] = await query(and(eq(schema.flights.userId, userId), eq(schema.flights.id, id)), "desc", userId);
  if (!f) return null;
  const db = await getDb();
  const sources = await db
    .select({ e: schema.emailMessages, kind: schema.flightSources.kind })
    .from(schema.flightSources)
    .innerJoin(schema.emailMessages, eq(schema.emailMessages.id, schema.flightSources.emailMessageId))
    .where(eq(schema.flightSources.flightId, id))
    .orderBy(asc(schema.emailMessages.date));
  return { flight: f, sources };
}

export type ReviewFlight = FlightWithAirports & { clash?: Clash };

/** Flights the importer was unsure about, plus flights that clash with each other (see clashes.ts). */
export async function reviewFlights(userId: string): Promise<ReviewFlight[]> {
  const all = await query(and(eq(schema.flights.userId, userId), eq(schema.flights.hidden, false)), "desc", userId);
  const clashes = findClashes(all.filter((f) => !f.cancelled && !f.forOthers));
  return all
    .filter((f) => f.needsReview || clashes.has(f.id))
    .map((f) => ({ ...f, clash: clashes.get(f.id) }));
}

/** Flights that count towards the Passport: flown, not hidden, and yours (unless you include others). */
export async function passportFlights(user: User): Promise<FlightWithAirports[]> {
  const all = await query(and(eq(schema.flights.userId, user.id), eq(schema.flights.hidden, false)), "asc", user.id);
  return all.filter((f) => f.status === "flown" && (user.includeOthers || !f.forOthers));
}

export async function flightYears(userId: string): Promise<string[]> {
  const db = await getDb();
  const rows = await db
    .selectDistinct({ y: sql<string>`substr(${schema.flights.depDate}, 1, 4)` })
    .from(schema.flights)
    .where(and(eq(schema.flights.userId, userId), eq(schema.flights.hidden, false)));
  return rows.map((r) => r.y).sort().reverse();
}

export async function getAliases(userId: string) {
  const db = await getDb();
  return db.select().from(schema.passengerAliases).where(eq(schema.passengerAliases.userId, userId));
}
