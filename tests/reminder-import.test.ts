// End-to-end on an in-memory database: undated check-in reminders must not invent flights.
import { beforeAll, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import type { DB } from "@/db/client";
import { applyExtraction } from "@/lib/ingest/pipeline";
import type { Airport } from "@/db/schema";
import type { ExtractedLeg } from "@/lib/ingest/types";

let db: DB;
const U = "u1";
const AIRPORTS: Airport[] = [
  { iata: "BLR", icao: "VOBL", name: "Kempegowda", city: "Bengaluru", country: "IN", lat: 13.1979, lon: 77.7063, tz: "Asia/Kolkata", scheduled: true },
  { iata: "BOM", icao: "VABB", name: "Chhatrapati Shivaji", city: "Mumbai", country: "IN", lat: 19.0887, lon: 72.8679, tz: "Asia/Kolkata", scheduled: true },
  { iata: "JAI", icao: "VIJP", name: "Jaipur", city: "Jaipur", country: "IN", lat: 26.8242, lon: 75.8122, tz: "Asia/Kolkata", scheduled: true },
];
const airport = async (i: string) => AIRPORTS.find((a) => a.iata === i) ?? null;
const leg = (o: Partial<ExtractedLeg>): ExtractedLeg => ({
  airlineIata: "UK", airlineName: "Vistara", flightNumber: "UK 846", depIata: "BLR", arrIata: "BOM", depDate: "2023-11-08",
  depTime: "08:30", arrDate: null, arrTime: "10:10", pnr: "ABC123", seat: "22D", cabin: "economy",
  passengers: ["MR. RAVI KUMAR"], aircraftType: null, operatedBy: null, ...o,
});
const flights = () => db.select().from(schema.flights).where(eq(schema.flights.userId, U));

beforeAll(async () => {
  db = drizzle(new PGlite(), { schema }) as unknown as DB;
  await migrate(db as never, { migrationsFolder: "drizzle" });
  await db.insert(schema.users).values({ id: U, email: "t@example.com" });
  await db.insert(schema.airports).values(AIRPORTS);
  // Booking e-ticket on 15 Sep: BLR→BOM (UK 846) and BOM→JAI (UK 561) on 8 Nov.
  await applyExtraction(db, U, null, {
    emailKind: "booking", confidence: 0.95,
    legs: [leg({}), leg({ flightNumber: "UK 561", depIata: "BOM", arrIata: "JAI", depTime: "11:40", arrTime: "13:35" })],
  }, new Date("2023-09-15T10:00:00Z"), ["Ravi Kumar"], airport);
}, 30_000);

it("a reminder with no flight date attaches to the booked trip", async () => {
  await applyExtraction(db, U, null, {
    emailKind: "check_in", confidence: 0.5,
    legs: [leg({ depDate: null, depTime: null, arrTime: null, arrIata: "JAI", pnr: null, seat: null, passengers: ["Ravi"] })],
  }, new Date("2023-11-06T09:00:00Z"), ["Ravi Kumar"], airport);
  const fs = await flights();
  expect(fs).toHaveLength(2);
  expect(fs.find((f) => f.flightNumber === "UK846")?.arrIata).toBe("BOM"); // not overwritten with the trip's final stop
});

it("a reminder dated the day of the email (no time) also attaches instead of inventing a flight", async () => {
  await applyExtraction(db, U, null, {
    emailKind: "check_in", confidence: 0.5,
    legs: [leg({ depDate: "2023-11-07", depTime: null, arrTime: null, arrIata: "JAI", pnr: null, seat: null })],
  }, new Date("2023-11-07T09:00:00Z"), ["Ravi Kumar"], airport);
  expect(await flights()).toHaveLength(2);
});

it("a reminder for a trip that isn't booked yet is ignored", async () => {
  await applyExtraction(db, U, null, {
    emailKind: "check_in", confidence: 0.5,
    legs: [leg({ flightNumber: "UK 999", depDate: null, depTime: null })],
  }, new Date("2023-11-07T09:00:00Z"), ["Ravi Kumar"], airport);
  expect(await flights()).toHaveLength(2);
});

it("a real booking with a printed date still creates its flight", async () => {
  await applyExtraction(db, U, null, {
    emailKind: "booking", confidence: 0.95,
    legs: [leg({ depDate: "2023-12-20", depTime: "08:30" })],
  }, new Date("2023-12-01T09:00:00Z"), ["Ravi Kumar"], airport);
  expect(await flights()).toHaveLength(3);
});
