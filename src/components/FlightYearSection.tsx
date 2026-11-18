import Link from "next/link";
import type { FlightWithAirports } from "@/lib/data";
import { FlightCard } from "@/components/FlightCard";

/** One year of past flights on the Flights page: heading with a Passport link, then the boarding passes. */
export function FlightYearSection({ year, flights, units }: { year: string; flights: FlightWithAirports[]; units: string }) {
  return (
    <section>
      <YearHeading year={year} flown={flights.filter((f) => f.status === "flown").length} />
      <div className="grid gap-3 md:grid-cols-2">{flights.map((f) => <FlightCard key={f.id} f={f} units={units} />)}</div>
    </section>
  );
}

export function YearHeading({ year, flown }: { year: string; flown: number }) {
  return (
    <div className="mb-3 flex items-baseline justify-between">
      <h2 className="text-xl font-semibold">{year}</h2>
      <Link href={`/passport?year=${year}`} className="text-xs text-muted hover:text-accent">
        {flown} flown · Passport →
      </Link>
    </div>
  );
}
