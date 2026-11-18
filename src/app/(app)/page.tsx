import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { flightYears, listFlights } from "@/lib/data";
import { FlightCard } from "@/components/FlightCard";
import { FlightYearSection } from "@/components/FlightYearSection";
import { OlderYears, type YearSummary } from "@/components/OlderYears";
import { loadFlightYear } from "./year-actions";

/** Past flights rendered straight away; older whole years load as you scroll (searches show everything). */
const FIRST_VIEW_PAST_FLIGHTS = 16;

export default async function FlightsPage({ searchParams }: PageProps<"/">) {
  const user = await requireUser();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const year = typeof sp.year === "string" ? sp.year : "";
  const [flights, years] = await Promise.all([listFlights(user.id, { q, year }), flightYears(user.id)]);

  const upcoming = flights.filter((f) => f.status === "upcoming").reverse();
  const past = flights.filter((f) => f.status !== "upcoming");
  const byYear = new Map<string, typeof past>();
  for (const f of past) {
    const y = f.depDate.slice(0, 4);
    byYear.set(y, [...(byYear.get(y) ?? []), f]);
  }
  // Whole years until enough flights are on screen; the rest are summarised and fetched on demand.
  const firstYears: [string, typeof past][] = [];
  const laterYears: YearSummary[] = [];
  let shown = 0;
  for (const [y, fs] of byYear) {
    if (q || year || shown < FIRST_VIEW_PAST_FLIGHTS) {
      firstYears.push([y, fs]);
      shown += fs.length;
    } else {
      laterYears.push({ year: y, count: fs.length, flown: fs.filter((f) => f.status === "flown").length });
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Flights</h1>
          <p className="text-sm text-muted">{flights.length} flights{year ? ` in ${year}` : ""}</p>
        </div>
        <form className="flex gap-2" action="/">
          <input name="q" defaultValue={q} placeholder="Search city, airport, airline, PNR" className="input sm:w-72" aria-label="Search flights" />
          <select name="year" defaultValue={year} className="input w-28" aria-label="Year">
            <option value="">All years</option>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <button className="btn">Go</button>
        </form>
      </div>

      {flights.length === 0 && (
        <div className="card p-10 text-center">
          <p className="text-lg font-medium">No flights yet</p>
          <p className="mt-1 text-sm text-muted">
            {q || year ? "Nothing matches that search." : "Go to Settings and run a Gmail sync to find your flights since 2016."}
          </p>
          {!q && !year && <Link href="/settings" className="btn btn-primary mt-4">Open Settings</Link>}
        </div>
      )}

      {upcoming.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-accent-2">Upcoming</h2>
          <div className="grid gap-3 md:grid-cols-2">{upcoming.map((f) => <FlightCard key={f.id} f={f} units={user.units} />)}</div>
        </section>
      )}

      {firstYears.map(([y, fs]) => <FlightYearSection key={y} year={y} flights={fs} units={user.units} />)}
      {laterYears.length > 0 && <OlderYears years={laterYears} loadYearAction={loadFlightYear} />}
    </div>
  );
}
