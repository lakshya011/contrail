import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { getAliases, getFlight, type FlightWithAirports } from "@/lib/data";
import { describeSeats } from "@/lib/seats";
import { displayFlightNumber } from "@/lib/ingest/types";
import { formatDate, formatDuration, timeOf } from "@/lib/time";
import { CABIN_LABEL, fmtDistance } from "@/lib/format";
import { RouteMap } from "@/components/RouteMap";
import { StatusChip } from "@/components/FlightCard";
import { FlightForm } from "@/components/FlightForm";
import { BackButton } from "@/components/BackButton";
import { alsoSoldAs, changedFrom, operatedByNote, operatingAirline, primaryNumber } from "@/lib/flight-display";
import { confirmFlight, hideFlightAndGoHome, updateFlight } from "../../actions";

export default async function FlightPage({ params }: PageProps<"/flights/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const data = await getFlight(user.id, id);
  if (!data) notFound();
  const { flight: f, sources } = data;
  const aliases = (await getAliases(user.id)).map((a) => a.name);

  const routes = f.dep && f.arr ? [{ key: "r", from: [f.dep.lon, f.dep.lat] as [number, number], to: [f.arr.lon, f.arr.lat] as [number, number], count: 1 }] : [];
  const airports = [f.dep, f.arr].filter((a) => !!a).map((a) => ({ iata: a.iata, lon: a.lon, lat: a.lat, count: 1, city: a.city }));
  const facts: [string, string | null | undefined][] = [
    ["Date", formatDate(f.depDate)],
    ["Duration", formatDuration(f.durationMin)],
    ["Distance", fmtDistance(f.distanceKm, user.units)],
    [f.seats.length > 1 ? "Seats" : "Seat", describeSeats(f.seats, aliases) ?? f.seat],
    ["Cabin", f.cabin ? CABIN_LABEL[f.cabin] ?? f.cabin : null],
    ["PNR", f.pnr],
    ["Aircraft", f.aircraftType],
    ["Also sold as", alsoSoldAs(f).length ? alsoSoldAs(f).map(displayFlightNumber).join(", ") + (f.airlineName && primaryNumber(f) !== f.flightNumber ? ` (booked with ${f.airlineName})` : "") : null],
    ["Changed from", changedFrom(f).length ? changedFrom(f).map(displayFlightNumber).join(", ") : null],
    [f.passengerNames.length > 1 ? "Passengers" : "Passenger", f.passengerNames.length ? f.passengerNames.join(", ") : f.passengerName],
  ];

  return (
    <div className="space-y-6">
      <BackButton />

      <div className="card overflow-hidden">
        <div className="p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm text-muted">
              <span className="font-mono font-semibold text-text">{displayFlightNumber(primaryNumber(f))}</span>
              {operatingAirline(f).name ? ` · ${operatingAirline(f).name}` : ""}
              {operatedByNote(f) ? ` (${operatedByNote(f)})` : ""}
            </div>
            <StatusChip status={f.status} forOthers={f.forOthers} review={f.needsReview} />
          </div>
          <div className="mt-5 grid grid-cols-[1fr_auto_1fr] items-center gap-4">
            <div>
              <div className="font-serif text-5xl tracking-tight sm:text-6xl">{f.depIata}</div>
              <AirportLabel airport={f.dep} />
              <div className="mt-2 font-mono text-2xl tabular">{timeOf(f.schedDepLocal) ?? "--:--"}</div>
            </div>
            <div className="flex w-20 flex-col items-center gap-1 text-xs text-muted sm:w-48 md:w-72">
              <span className="font-mono tabular">{formatDuration(f.durationMin)}</span>
              <div className="relative my-1 w-full border-t border-dashed border-perf">
                <svg viewBox="0 0 24 24" className="absolute -top-[11px] left-1/2 h-5 w-5 -translate-x-1/2 rotate-90 bg-panel px-0.5 text-accent" fill="currentColor" aria-hidden>
                  <path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z" />
                </svg>
                <span className="absolute -left-1 -top-[4px] h-1.5 w-1.5 rounded-full bg-accent-2" aria-hidden />
                <span className="absolute -right-1 -top-[4px] h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
              </div>
              <span className="tabular">{fmtDistance(f.distanceKm, user.units)}</span>
            </div>
            <div className="text-right">
              <div className="font-serif text-5xl tracking-tight sm:text-6xl">{f.arrIata}</div>
              <AirportLabel airport={f.arr} align="right" />
              <div className="mt-2 font-mono text-2xl tabular">{timeOf(f.schedArrLocal) ?? "--:--"}</div>
            </div>
          </div>
        </div>
        <RouteMap routes={routes} airports={airports} globe={false} className="h-64 rounded-none border-x-0 border-b-0" />
      </div>

      {f.needsReview && (
        <div className="card flex flex-col gap-3 border-accent/40 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="font-medium text-accent">Needs review</div>
            <div className="text-sm text-muted">{f.reviewReason}</div>
          </div>
          <form action={confirmFlight.bind(null, f.id)}><button className="btn btn-primary">Looks right</button></form>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {facts.map(([k, v]) => (
          <div key={k} className="card p-4">
            <div className="text-xs text-muted">{k}</div>
            <div className="mt-1 break-words font-medium">{v || "—"}</div>
          </div>
        ))}
      </div>

      <section className="card p-5">
        <h2 className="mb-3 font-semibold">Found in</h2>
        {sources.length === 0 ? (
          <p className="text-sm text-muted">{f.source === "manual" ? "Added by hand." : "Sample data (no source email)."}</p>
        ) : (
          <ul className="divide-y divide-line">
            {sources.map(({ e, kind }) => (
              <li key={e.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <div className="min-w-0">
                  <div className="truncate">{e.subject ?? "(no subject)"}</div>
                  <div className="truncate text-xs text-muted">{e.fromAddr} · {e.date ? e.date.toISOString().slice(0, 10) : ""} · {kind?.replace("_", " ")}</div>
                </div>
                <a className="btn shrink-0" target="_blank" rel="noreferrer" href={`https://mail.google.com/mail/u/0/#all/${e.threadId ?? e.gmailId}`}>Open in Gmail</a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <details className="card p-5">
        <summary className="cursor-pointer font-semibold">Edit flight</summary>
        <p className="mb-4 mt-1 text-xs text-muted">Saving marks the flight as confirmed, so later emails will not change these details.</p>
        <FlightForm
          action={updateFlight.bind(null, f.id)}
          submitLabel="Save changes"
          defaults={{
            flightNumber: displayFlightNumber(f.flightNumber), depIata: f.depIata, arrIata: f.arrIata, depDate: f.depDate,
            depTime: timeOf(f.schedDepLocal), arrDate: f.schedArrLocal?.slice(0, 10), arrTime: timeOf(f.schedArrLocal),
            seat: f.seat, cabin: f.cabin, pnr: f.pnr, aircraftType: f.aircraftType, forOthers: f.forOthers, cancelled: f.cancelled,
          }}
        />
        <form action={hideFlightAndGoHome.bind(null, f.id)} className="mt-6 border-t border-line pt-4">
          <button className="btn btn-danger">Remove this flight</button>
          <span className="ml-3 text-xs text-muted">It stays hidden even if the email is read again.</span>
        </form>
      </details>
    </div>
  );
}

/** City first (short enough for a phone), then the airport's full name in small type underneath. */
function AirportLabel({ airport, align = "left" }: { airport: FlightWithAirports["dep"]; align?: "left" | "right" }) {
  if (!airport) return <div className="text-sm text-muted">Unknown airport</div>;
  const city = airport.city?.trim();
  return (
    <div className={align === "right" ? "ml-auto max-w-[11rem] sm:max-w-none" : "max-w-[11rem] sm:max-w-none"}>
      <div className="truncate text-sm font-medium">{city || airport.name}</div>
      {city && city !== airport.name && <div className="line-clamp-2 text-xs leading-snug text-muted">{airport.name}</div>}
    </div>
  );
}
