"use server";

import { requireUser } from "@/lib/auth/session";
import { listFlights } from "@/lib/data";
import { FlightYearSection } from "@/components/FlightYearSection";

/** Renders one older year of the Flights page when you scroll down to it. */
export async function loadFlightYear(year: string) {
  if (!/^\d{4}$/.test(year)) throw new Error("Invalid year");
  const user = await requireUser();
  const flights = (await listFlights(user.id, { year })).filter((f) => f.status !== "upcoming");
  return <FlightYearSection year={year} flights={flights} units={user.units} />;
}
