import { sql } from "drizzle-orm";
import {
  jsonb,
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  real,
  serial,
  uniqueIndex,
  index,
  primaryKey,
  doublePrecision,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name"),
  image: text("image"),
  /** AES-GCM encrypted Google refresh token (see src/lib/crypto.ts). */
  googleRefreshToken: text("google_refresh_token"),
  homeAirport: text("home_airport"),
  units: text("units").notNull().default("km"), // "km" | "mi"
  /** Count flights booked for other passengers in stats. */
  includeOthers: boolean("include_others").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const passengerAliases = pgTable(
  "passenger_aliases",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
  },
  (t) => [index("passenger_aliases_user_idx").on(t.userId)],
);

export const gmailSync = pgTable("gmail_sync", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  backfillPageToken: text("backfill_page_token"),
  backfillListed: boolean("backfill_listed").notNull().default(false),
  /** When the last listing pass started; the next incremental search starts here. */
  lastListStartedAt: timestamp("last_list_started_at", { withTimezone: true }),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  lastError: text("last_error"),
});

export const emailMessages = pgTable(
  "email_messages",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    gmailId: text("gmail_id").notNull(),
    threadId: text("thread_id"),
    date: timestamp("date", { withTimezone: true }),
    fromAddr: text("from_addr"),
    subject: text("subject"),
    // pending | extracted | no_flights | ignored | error
    status: text("status").notNull().default("pending"),
    parser: text("parser"), // markup | llm | none
    emailKind: text("email_kind"),
    promptVersion: integer("prompt_version"),
    error: text("error"),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("email_messages_user_gmail_idx").on(t.userId, t.gmailId),
    index("email_messages_status_idx").on(t.userId, t.status),
  ],
);

export const flights = pgTable(
  "flights",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    airlineIata: text("airline_iata"),
    airlineName: text("airline_name"),
    /** Normalised, no space: "6E2131", "UA901". */
    flightNumber: text("flight_number").notNull(),
    depIata: text("dep_iata").notNull(),
    arrIata: text("arr_iata").notNull(),
    /** Local departure date, YYYY-MM-DD. Part of the dedupe key. */
    depDate: text("dep_date").notNull(),
    /** Local wall-clock times, YYYY-MM-DDTHH:mm, as printed on the ticket. */
    schedDepLocal: text("sched_dep_local"),
    schedArrLocal: text("sched_arr_local"),
    schedDepUtc: timestamp("sched_dep_utc", { withTimezone: true }),
    schedArrUtc: timestamp("sched_arr_utc", { withTimezone: true }),
    actualDepUtc: timestamp("actual_dep_utc", { withTimezone: true }),
    actualArrUtc: timestamp("actual_arr_utc", { withTimezone: true }),
    aircraftType: text("aircraft_type"),
    /** Codeshares: the airline actually flying the plane, when it differs from the one you booked. */
    operatingAirlineIata: text("operating_airline_iata"),
    operatingAirlineName: text("operating_airline_name"),
    /** Other flight numbers this same flight was sold under (e.g. DL5947 for VS5947). */
    codeshareNumbers: jsonb("codeshare_numbers").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    tailNumber: text("tail_number"),
    seat: text("seat"),
    /** Every seat on the booking, tied to a passenger when an email says whose it is (name null = not known yet). */
    seats: jsonb("seats").$type<{ name: string | null; seat: string }[]>().notNull().default(sql`'[]'::jsonb`),
    cabin: text("cabin"), // economy | premium_economy | business | first
    pnr: text("pnr"),
    passengerName: text("passenger_name"),
    /** Every passenger name printed on this flight's tickets, so travellers can be re-matched without re-reading email. */
    passengerNames: jsonb("passenger_names").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    /** True when the ticket names someone who is not one of your aliases. */
    forOthers: boolean("for_others").notNull().default(false),
    cancelled: boolean("cancelled").notNull().default(false),
    /** Date of the email that last set cancelled/times, so newer emails win. */
    statusEmailAt: timestamp("status_email_at", { withTimezone: true }),
    timesEmailAt: timestamp("times_email_at", { withTimezone: true }),
    distanceKm: real("distance_km"),
    durationMin: integer("duration_min"),
    confidence: real("confidence"),
    needsReview: boolean("needs_review").notNull().default(false),
    reviewReason: text("review_reason"),
    /** Rejected in review: kept so re-syncs do not bring it back. */
    hidden: boolean("hidden").notNull().default(false),
    /** Confirmed or edited by you: later emails can no longer change its details. */
    userConfirmed: boolean("user_confirmed").notNull().default(false),
    source: text("source").notNull().default("email"), // email | manual | demo
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("flights_dedupe_idx").on(t.userId, t.flightNumber, t.depDate, t.depIata),
    index("flights_user_dep_idx").on(t.userId, t.depDate),
  ],
);

export const flightSources = pgTable(
  "flight_sources",
  {
    flightId: text("flight_id")
      .notNull()
      .references(() => flights.id, { onDelete: "cascade" }),
    emailMessageId: integer("email_message_id")
      .notNull()
      .references(() => emailMessages.id, { onDelete: "cascade" }),
    kind: text("kind"),
  },
  (t) => [primaryKey({ columns: [t.flightId, t.emailMessageId] })],
);

export const airports = pgTable("airports", {
  iata: text("iata").primaryKey(),
  icao: text("icao"),
  name: text("name").notNull(),
  city: text("city"),
  country: text("country").notNull(), // ISO 3166-1 alpha-2
  lat: doublePrecision("lat").notNull(),
  lon: doublePrecision("lon").notNull(),
  tz: text("tz"),
  /** Has scheduled airline service (OurAirports). false = airstrip/heliport, so a code here is likely misread. */
  scheduled: boolean("scheduled"),
});

export const airlines = pgTable("airlines", {
  iata: text("iata").primaryKey(),
  icao: text("icao"),
  name: text("name").notNull(),
  country: text("country"),
});

export type User = typeof users.$inferSelect;
export type Flight = typeof flights.$inferSelect;
export type NewFlight = typeof flights.$inferInsert;
export type Airport = typeof airports.$inferSelect;
export type EmailMessage = typeof emailMessages.$inferSelect;
