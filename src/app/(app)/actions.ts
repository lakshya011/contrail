"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/db/client";
import { requireUser } from "@/lib/auth/session";
import { derive } from "@/lib/ingest/enrich";
import type { FlightState } from "@/lib/ingest/reconcile";
import { normalizeFlightNumber } from "@/lib/ingest/types";
import { resetEmails } from "@/lib/ingest/pipeline";
import { rematchPassengers } from "@/lib/ingest/rematch";
import { mergeSeats, parseSeatText } from "@/lib/seats";
import { isValidDate, isValidTime } from "@/lib/time";

const s = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" && v.trim() ? v.trim() : null;
};

async function ownFlight(userId: string, id: string) {
  const db = await getDb();
  const [f] = await db.select().from(schema.flights).where(and(eq(schema.flights.id, id), eq(schema.flights.userId, userId)));
  return f ?? null;
}

function refresh() {
  revalidatePath("/", "layout");
}

export async function confirmFlight(id: string) {
  const user = await requireUser();
  if (!(await ownFlight(user.id, id))) return;
  const db = await getDb();
  await db.update(schema.flights).set({ userConfirmed: true, needsReview: false, updatedAt: new Date() }).where(eq(schema.flights.id, id));
  refresh();
}

export async function hideFlight(id: string) {
  const user = await requireUser();
  if (!(await ownFlight(user.id, id))) return;
  const db = await getDb();
  await db.update(schema.flights).set({ hidden: true, needsReview: false, updatedAt: new Date() }).where(eq(schema.flights.id, id));
  refresh();
}

/** "I took this one": confirm it and mark the flights it clashes with as cancelled. */
export async function keepFlightCancelOthers(id: string, otherIds: string[]) {
  const user = await requireUser();
  if (!(await ownFlight(user.id, id))) return;
  const db = await getDb();
  await db.update(schema.flights).set({ userConfirmed: true, needsReview: false, updatedAt: new Date() }).where(eq(schema.flights.id, id));
  for (const other of otherIds) {
    if (!(await ownFlight(user.id, other))) continue;
    await db.update(schema.flights)
      .set({ cancelled: true, statusEmailAt: new Date(), userConfirmed: true, needsReview: false, updatedAt: new Date() })
      .where(eq(schema.flights.id, other));
  }
  refresh();
}

export async function hideFlightAndGoHome(id: string) {
  await hideFlight(id);
  redirect("/");
}

type FormResult = { error?: string; ok?: boolean };

/** Shared by "edit flight" and "add flight by hand". */
async function readFlightForm(fd: FormData) {
  const fn = normalizeFlightNumber(s(fd, "flightNumber") ?? "");
  const dep = s(fd, "depIata")?.toUpperCase(), arr = s(fd, "arrIata")?.toUpperCase();
  const depDate = s(fd, "depDate"), depTime = s(fd, "depTime"), arrDate = s(fd, "arrDate") ?? depDate, arrTime = s(fd, "arrTime");
  if (!fn) return { error: "Flight number looks wrong. Use a form like 6E 2131." } as const;
  if (!dep || !/^[A-Z]{3}$/.test(dep) || !arr || !/^[A-Z]{3}$/.test(arr)) return { error: "Use 3-letter airport codes." } as const;
  if (!isValidDate(depDate)) return { error: "Departure date is required." } as const;
  if (depTime && !isValidTime(depTime)) return { error: "Times use 24h HH:mm." } as const;
  if (arrTime && !isValidTime(arrTime)) return { error: "Times use 24h HH:mm." } as const;
  const db = await getDb();
  const [airline] = await db.select().from(schema.airlines).where(eq(schema.airlines.iata, fn.code));
  const state: FlightState = {
    airlineIata: fn.code.length === 2 ? fn.code : null,
    airlineName: airline?.name ?? null,
    flightNumber: fn.full, depIata: dep, arrIata: arr, depDate,
    schedDepLocal: depTime ? `${depDate}T${depTime}` : null,
    schedArrLocal: arrTime && isValidDate(arrDate) ? `${arrDate}T${arrTime}` : null,
    seat: s(fd, "seat")?.toUpperCase() ?? null, seats: [], cabin: s(fd, "cabin"), pnr: s(fd, "pnr")?.toUpperCase() ?? null,
    passengerName: null, passengerNames: [], operatingAirlineIata: null, operatingAirlineName: null, codeshareNumbers: [],
    aircraftType: s(fd, "aircraftType"), forOthers: fd.get("forOthers") === "on",
    cancelled: fd.get("cancelled") === "on", statusEmailAt: new Date(), timesEmailAt: new Date(),
    confidence: 1, userConfirmed: true,
  };
  const [depA] = await db.select().from(schema.airports).where(eq(schema.airports.iata, dep));
  const [arrA] = await db.select().from(schema.airports).where(eq(schema.airports.iata, arr));
  if (!depA || !arrA) return { error: `Unknown airport code ${!depA ? dep : arr}.` } as const;
  // Edits never wipe what emails recorded about passengers or codeshares.
  const { passengerName: _p, passengerNames: _n, operatingAirlineIata: _oi, operatingAirlineName: _on, codeshareNumbers: _c, seats: _s, ...rest } = state;
  return { values: { ...rest, ...derive(state, depA, arrA), updatedAt: new Date() } } as const;
}

export async function updateFlight(id: string, _prev: FormResult, fd: FormData): Promise<FormResult> {
  const user = await requireUser();
  const existing = await ownFlight(user.id, id);
  if (!existing) return { error: "Not found" };
  const r = await readFlightForm(fd);
  if ("error" in r) return { error: r.error };
  // A changed seat box updates your own seat; companions' seats from emails are kept.
  let seats = existing.seats ?? [];
  if ((r.values.seat ?? null) !== (existing.seat ?? null) && r.values.seat) {
    const typed = parseSeatText(r.values.seat);
    if (typed.length === 1 && !typed[0].name && existing.passengerName) typed[0].name = existing.passengerName;
    seats = mergeSeats(seats, typed, true);
  }
  const db = await getDb();
  try {
    await db.update(schema.flights).set({ ...r.values, seats }).where(eq(schema.flights.id, id));
  } catch {
    return { error: "Another flight already has this number, date and departure airport." };
  }
  refresh();
  return { ok: true };
}

export async function addFlight(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const user = await requireUser();
  const r = await readFlightForm(fd);
  if ("error" in r) return { error: r.error };
  const db = await getDb();
  const id = crypto.randomUUID();
  try {
    await db.insert(schema.flights).values({ id, userId: user.id, source: "manual", ...r.values });
  } catch {
    return { error: "You already have this flight." };
  }
  refresh();
  redirect(`/flights/${id}`);
}

export async function saveSettings(fd: FormData) {
  const user = await requireUser();
  const db = await getDb();
  const home = s(fd, "homeAirport")?.toUpperCase() ?? null;
  await db.update(schema.users).set({
    units: s(fd, "units") === "mi" ? "mi" : "km",
    homeAirport: home && /^[A-Z]{3}$/.test(home) ? home : null,
    includeOthers: fd.get("includeOthers") === "on",
  }).where(eq(schema.users.id, user.id));
  refresh();
}

export async function addAlias(fd: FormData) {
  const user = await requireUser();
  const name = s(fd, "name");
  if (!name) return;
  const db = await getDb();
  await db.insert(schema.passengerAliases).values({ userId: user.id, name: name.slice(0, 100) });
  await rematchPassengers(user.id);
  refresh();
}

export async function removeAlias(id: number) {
  const user = await requireUser();
  const db = await getDb();
  await db.delete(schema.passengerAliases).where(and(eq(schema.passengerAliases.id, id), eq(schema.passengerAliases.userId, user.id)));
  await rematchPassengers(user.id);
  refresh();
}

export async function reprocess(which: "all" | "errors") {
  const user = await requireUser();
  await resetEmails(user.id, which);
  refresh();
}
